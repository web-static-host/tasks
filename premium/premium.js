let techSpecialists = [];
let detailedTasksStore = {};
let headName = null;

document.addEventListener('DOMContentLoaded', async () => {
    setDefaultMonth();
    await loadSpecialists();
    await calculatePremium(); // Сразу считаем за прошлый месяц при входе
});

// Устанавливает предыдущий месяц по умолчанию
function setDefaultMonth() {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    document.getElementById('report-month').value = `${yyyy}-${mm}`;
}

// Подгружаем только обычных тех спецов (role_id = 3)
// Подгружаем спецов (3) и директора (5)
async function loadSpecialists() {
    const { data, error } = await supabase.from('users')
        .select('id, full_name, display_name, user_roles!inner(role_id)')
        .in('user_roles.role_id', [3, 5]) // Берем и технарей, и director
        .eq('is_active', true)
        .order('full_name');

    if (error) {
        console.error("Ошибка загрузки специалистов:", error);
        return;
    }
    
    techSpecialists = [];
    headName = null;

    (data || []).forEach(u => {
        const name = (u.display_name || u.full_name).trim();
        techSpecialists.push({ id: u.id, name: name });
        
        // Безопасная проверка: Supabase может вернуть объект или массив
        const roles = Array.isArray(u.user_roles) ? u.user_roles : [u.user_roles];
        if (roles.some(r => r && r.role_id === 5)) {
            headName = name; // Запоминаем босса
        }
    });

    const select = document.getElementById('report-specialist');
    select.innerHTML = '';
    
    // Безопасно достаем текущего юзера
    const user = typeof currentUser !== 'undefined' ? currentUser : JSON.parse(localStorage.getItem('currentUser') || '{}');
    
    // --- ОГРАНИЧЕНИЕ ВИДИМОСТИ ---
    if (user.role === 'specialist' || user.role === 'specialist_1c') {
        // Обычный технарь видит только себя, список заблокирован
        select.innerHTML = `<option value="${user.name}">${user.name}</option>`;
        select.disabled = true;
    } else {
        // director или admin видят всех
        select.innerHTML = '<option value="all">Все специалисты</option>';
        techSpecialists.forEach(s => {
            select.add(new Option(s.name, s.name));
        });
    }
}

// Главная функция подсчета
window.calculatePremium = async function() {
    const container = document.getElementById('premium-results');
    const monthVal = document.getElementById('report-month').value;
    const selectedSpec = document.getElementById('report-specialist').value;

    if (!monthVal) return alert("Выберите месяц!");

    container.innerHTML = '<div class="text-center py-5 text-muted">⏳ Запрашиваю данные из БД...</div>';

    const [year, month] = monthVal.split('-');
    const startDate = `${year}-${month}-01`;
    const lastDay = new Date(year, parseInt(month), 0).getDate();
    const endDate = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;

    try {
        // 1. Платные и Демонстрации
        // ДОБАВЛЕНО: task_name, inn, date
        const { data: paidTasks, error: paidError } = await supabase.from('tasks')
            .select('id, specialist, price, category, task_name, inn, date')
            .gte('date', startDate)
            .lte('date', endDate)
            .eq('status', 'Выполнено');
        
        if (paidError) throw paidError;

        // 2. Бесплатные задачи
        // ДОБАВЛЕНО: task_name, inn
        const { data: allFreeTasks, error: freeError } = await supabase.from('free_tasks')
            .select('id, specialist, date, task_name, inn')
            .eq('status', 'Выполнено');

        if (freeError) throw freeError;

        // 3. Вычисляем ТОЧНУЮ дату выполнения для каждой бесплатной задачи через Историю
        let allCompletedHistory = [];
        const chunkSize = 150; // Пачками по 150 ID, чтобы не перегружать канал
        for (let i = 0; i < (allFreeTasks || []).length; i += chunkSize) {
            const chunkIds = allFreeTasks.slice(i, i + chunkSize).map(t => t.id);
            const { data: hData } = await supabase
                .from('task_history')
                .select('task_id, created_at, changes')
                .in('task_id', chunkIds)
                .eq('action_type', 'status_change');
            
            if (hData) allCompletedHistory.push(...hData);
        }

        // Создаем карту: ID Задачи -> Последняя дата перевода в "Выполнено"
        const taskCompletionDates = {};
        allCompletedHistory.forEach(h => {
            if (h.changes && h.changes.status && h.changes.status.new === 'Выполнено') {
                // Если статус меняли туда-сюда, оставляем самую свежую дату
                if (!taskCompletionDates[h.task_id] || new Date(h.created_at) > new Date(taskCompletionDates[h.task_id])) {
                    taskCompletionDates[h.task_id] = h.created_at;
                }
            }
        });

        // Фильтруем бесплатные задачи строго по дате фактического выполнения
        const sDate = new Date(`${startDate}T00:00:00`);
        const eDate = new Date(`${endDate}T23:59:59`);

        const validFreeTasks = (allFreeTasks || []).filter(t => {
            const compDateStr = taskCompletionDates[t.id];
            if (compDateStr) {
                // Если история есть: проверяем, попал ли клик "Выполнено" в выбранный месяц
                const compDate = new Date(compDateStr);
                return compDate >= sDate && compDate <= eDate;
            } else {
                // Если истории нет (старые архивные задачи): используем дату создания
                return t.date >= startDate && t.date <= endDate;
            }
        });

        console.log(`Получено из БД: Платных/Демо - ${paidTasks.length} шт., Бесплатных (выполненных в этом месяце) - ${validFreeTasks.length} шт.`);

        // Формируем список легитимных технарей
        const allowedNames = techSpecialists.map(s => s.name);

        // 4. Готовим объект-копилку
        let stats = {};
        let totalDepartmentPaidSum = 0; // Копилка для 1% директора

        const initSpec = (name) => {
            const cleanName = name ? name.trim() : 'Неизвестно';
            if (!stats[cleanName]) stats[cleanName] = { paidSum: 0, demoCount: 0, freeCount: 0 };
            return cleanName;
        };

        // ПРИНУДИТЕЛЬНО добавляем руководителя в список! 
        // Даже если он не сделал ни одной личной задачи, он должен получить свой 1%
        if (headName) {
            initSpec(headName);
        }

        // Раскидываем Платные/Демо
        (paidTasks || []).forEach(t => {
            const name = initSpec(t.specialist);
            if (t.category === 'Демонстрация') {
                stats[name].demoCount++;
            } else {
                const price = Number(t.price) || 0;
                stats[name].paidSum += price;
                // В общую копилку отдела идут деньги всех, КРОМЕ личных задач директора
                if (name !== headName) {
                    totalDepartmentPaidSum += price;
                }
            }
        });

        // Раскидываем Бесплатные
        validFreeTasks.forEach(t => {
            const name = initSpec(t.specialist);
            stats[name].freeCount++;
        });

        // 5. Отрисовка результатов
        let html = '<div class="row g-4">';
        let totalSystemPremium = 0;
        let hasAnyData = false;
        
        detailedTasksStore = {}; 

        const monthNames = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
        const reportMonthText = `${monthNames[parseInt(month) - 1]} ${year}`;

        Object.keys(stats).forEach(name => {
            if (selectedSpec !== 'all' && name !== selectedSpec) return;
            if (selectedSpec === 'all' && !allowedNames.includes(name)) return;

            const data = stats[name];
            
            // 1% ДЛЯ ДИРЕКТОРА
            let headBonus = 0;
            if (name === headName) {
                headBonus = totalDepartmentPaidSum * 0.01;
            }

            // ВАЖНО: Пропускаем человека только если у него 0 личных задач И нет бонуса руководителя
            if (data.paidSum === 0 && data.demoCount === 0 && data.freeCount === 0 && headBonus === 0) {
                return;
            }

            hasAnyData = true;

            // --- МАТЕМАТИКА ПРЕМИИ ---
            const premiumPaid = data.paidSum * 0.10;
            const premiumDemo = data.demoCount * 550;

            let freeRate = 50;
            if (data.freeCount > 100) freeRate = 80;
            else if (data.freeCount >= 80) freeRate = 70;
            else if (data.freeCount >= 50) freeRate = 60;
            const premiumFree = data.freeCount * freeRate;

            const totalPremium = premiumPaid + premiumDemo + premiumFree + headBonus;
            totalSystemPremium += totalPremium;

            detailedTasksStore[name] = {
                paid: (paidTasks || []).filter(t => t.specialist === name && t.category !== 'Демонстрация'),
                demo: (paidTasks || []).filter(t => t.specialist === name && t.category === 'Демонстрация'),
                free: (validFreeTasks || []).filter(t => t.specialist === name).map(t => ({
                    ...t, 
                    completionDate: taskCompletionDates[t.id] || t.date 
                })),
                monthLabel: reportMonthText,
                summary: { premiumPaid, premiumDemo, premiumFree, headBonus, totalDepartmentPaidSum, totalPremium, freeRate, data }
            };

            // --- КАРТОЧКА СОТРУДНИКА ---
            html += `
                <div class="col-md-3 mb-3">
                    <div class="premium-card h-100 d-flex flex-column">
                        <div class="premium-card-header text-primary d-flex justify-content-between align-items-center">
                            <span>${name}</span>
                            ${name === headName ? '<span class="badge bg-warning text-dark" style="font-size: 0.6rem;">Руководитель</span>' : ''}
                        </div>
                        <div class="p-3 flex-grow-1">
                            <div class="premium-stat-row">
                                <span class="text-muted">Платные (10%):</span>
                                <span><span class="text-secondary small me-1">из ${data.paidSum}₽</span> <b>${Math.round(premiumPaid)} ₽</b></span>
                            </div>
                            <div class="premium-stat-row">
                                <span class="text-muted">Демо (550₽/шт):</span>
                                <span><span class="text-secondary small me-1">${data.demoCount} шт.</span> <b>${premiumDemo} ₽</b></span>
                            </div>
                            <div class="premium-stat-row">
                                <span class="text-muted">Беспл. (${freeRate}₽/шт):</span>
                                <span><span class="text-secondary small me-1">${data.freeCount} шт.</span> <b>${premiumFree} ₽</b></span>
                            </div>
                            ${name === headName ? `
                            <div class="premium-stat-row" style="background-color: #fff9e6; margin: 4px -20px -8px -20px; padding: 8px 20px;">
                                <span class="text-muted">1% от отдела:</span>
                                <span><span class="text-secondary small me-1">от ${totalDepartmentPaidSum}₽</span> <b class="text-warning-emphasis">+${Math.round(headBonus)} ₽</b></span>
                            </div>` : ''}
                        </div>
                        <div class="p-3 bg-light border-top d-flex justify-content-between align-items-center">
                            <span class="text-uppercase text-muted" style="font-size: 0.8rem; font-weight: bold;">Итого премия:</span>
                            <span class="total-sum">${Math.round(totalPremium).toLocaleString('ru-RU')} ₽</span>
                        </div>
                        <div class="d-flex gap-2">
                            <button class="btn btn-outline-secondary btn-sm w-100" onclick="copyPremiumToClipboard('${name}')">📋 Копировать</button>
                            <button class="btn btn-primary btn-sm w-100" onclick="showDetailedReport('${name}')">🔍 Отчет</button>
                        </div>
                    </div>
                </div>
            `;
        });

        html += '</div>';

        if (!hasAnyData) {
            container.innerHTML = '<div class="text-center py-5 text-muted">За этот период нет выполненных задач.</div>';
            return;
        }

        if (selectedSpec === 'all') {
            html = `
                <div class="alert alert-success d-flex justify-content-between align-items-center mb-4 border-success-subtle shadow-sm">
                    <div>
                        <span class="fw-bold d-block text-success-emphasis">Общий фонд премии за период:</span>
                        <small class="text-success opacity-75">Все технические специалисты</small>
                    </div>
                    <div class="d-flex align-items-center gap-3">
                        <h3 class="mb-0 fw-bold text-success">${Math.round(totalSystemPremium).toLocaleString('ru-RU')} ₽</h3>
                        <button class="btn btn-success btn-sm shadow-sm rounded-pill px-3 ms-2" onclick="copyAllPremiumsToClipboard()">
                            📋 Скопировать общий отчет
                        </button>
                    </div>
                </div>
            ` + html;
        }

        container.innerHTML = html;

    } catch (err) {
        console.error("Ошибка при подсчете:", err);
        container.innerHTML = '<div class="text-danger text-center py-5">Произошла ошибка загрузки данных из БД.</div>';
    }
};

// Индивидуальный отчет для одного спеца
window.copyPremiumToClipboard = function(name) {
    const d = detailedTasksStore[name];
    if (!d) return;

    let text = `Премия за ${d.monthLabel} - ${name}\n`;
    text += `──────────────────────────────\n`;
    text += `% от выполненных услуг: ${d.summary.premiumPaid.toLocaleString('ru-RU', {minimumFractionDigits: 2})} ₽\n`;
    text += `  (${d.summary.data.paidSum.toLocaleString('ru-RU', {minimumFractionDigits: 2})} ₽ × 10%)\n`;
    
    text += `Бесплатные задачи: ${d.summary.premiumFree.toLocaleString('ru-RU', {minimumFractionDigits: 2})} ₽\n`;
    text += `  (${d.summary.data.freeCount} задач × ${d.summary.freeRate} ₽)\n`;
    
    text += `Демонстрации: ${d.summary.premiumDemo.toLocaleString('ru-RU', {minimumFractionDigits: 2})} ₽\n`;
    text += `  (${d.summary.data.demoCount} × 550 ₽)\n`;

    if (d.summary.headBonus > 0) {
        const depSum = Math.round(d.summary.headBonus / 0.01);
        text += `+1% от услуг отдела: ${d.summary.headBonus.toLocaleString('ru-RU', {minimumFractionDigits: 2})} ₽\n`;
        text += `  (${depSum.toLocaleString('ru-RU', {minimumFractionDigits: 2})} ₽ × 1%)\n`;
    }
    
    text += `──────────────────────────────\n`;
    text += `Итого: ${d.summary.totalPremium.toLocaleString('ru-RU', {minimumFractionDigits: 2})} ₽`;

    navigator.clipboard.writeText(text).then(() => {
        showToast(`📋 Отчет для ${name} скопирован!`);
    });
};

// Общий отчет для руководителя
window.copyAllPremiumsToClipboard = function() {
    // Берем месяц из первой попавшейся записи
    const sampleKey = Object.keys(detailedTasksStore)[0];
    if (!sampleKey) return;
    const monthLabel = detailedTasksStore[sampleKey].monthLabel;

    let totalSum = 0;
    
    let text = `═══ ОТЧЁТ ПО ПРЕМИЯМ ═══\n`;
    text += `Период: ${monthLabel}\n`;
    text += `══════════════════════════════════════\n\n`;

    const names = Object.keys(detailedTasksStore);
    
    names.forEach((name, index) => {
        const d = detailedTasksStore[name];
        totalSum += d.summary.totalPremium;

        text += `Премия за ${monthLabel} - ${name}\n`;
        text += `──────────────────────────────\n`;
        text += `% от выполненных услуг: ${d.summary.premiumPaid.toLocaleString('ru-RU', {minimumFractionDigits: 2})} ₽\n`;
        text += `  (${d.summary.data.paidSum.toLocaleString('ru-RU', {minimumFractionDigits: 2})} ₽ × 10%)\n`;
        
        text += `Бесплатные задачи: ${d.summary.premiumFree.toLocaleString('ru-RU', {minimumFractionDigits: 2})} ₽\n`;
        text += `  (${d.summary.data.freeCount} задач × ${d.summary.freeRate} ₽)\n`;
        
        text += `Демонстрации: ${d.summary.premiumDemo.toLocaleString('ru-RU', {minimumFractionDigits: 2})} ₽\n`;
        text += `  (${d.summary.data.demoCount} × 550 ₽)\n`;

        if (d.summary.headBonus > 0) {
            const depSum = Math.round(d.summary.headBonus / 0.01);
            text += `+1% от услуг отдела: ${d.summary.headBonus.toLocaleString('ru-RU', {minimumFractionDigits: 2})} ₽\n`;
            text += `  (${depSum.toLocaleString('ru-RU', {minimumFractionDigits: 2})} ₽ × 1%)\n`;
        }
        
        text += `──────────────────────────────\n`;
        text += `Итого: ${d.summary.totalPremium.toLocaleString('ru-RU', {minimumFractionDigits: 2})} ₽\n\n`;

        // Добавляем разделитель, если это не последний сотрудник
        if (index < names.length - 1) {
            text += `╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌\n\n`;
        }
    });

    text += `══════════════════════════════════════\n`;
    text += `ОБЩАЯ СУММА ПРЕМИЙ: ${totalSum.toLocaleString('ru-RU', {minimumFractionDigits: 2})} ₽`;

    navigator.clipboard.writeText(text).then(() => {
        showToast('📋 Общий отчет скопирован в буфер обмена!');
    });
};

// Функция для красивого всплывающего уведомления
function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'custom-toast shadow';
    toast.innerText = message;
    document.body.appendChild(toast);

    // Плавное появление
    setTimeout(() => toast.classList.add('show'), 10);

    // Удаление через 2.5 секунды
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

// Функция отрисовки подробной таблицы
window.showDetailedReport = function(name) {
    const d = detailedTasksStore[name];
    if (!d) return;

    document.getElementById('detailsModalLabel').innerText = `Детализация: ${name} (${d.monthLabel})`;
    const container = document.getElementById('details-table-container');

    // Достаем ставку технаря за бесплатные задачи (50, 60, 70 или 80)
    const freeRate = d.summary.freeRate; 

    let rows = '';
    
    const all = [
        ...d.paid.map(t => ({...t, type: 'Платная'})),
        ...d.demo.map(t => ({...t, type: 'Демо'})),
        ...d.free.map(t => ({...t, type: 'Бесплатная'}))
    ];

    all.forEach(t => {
        const dateStart = t.date ? new Date(t.date).toLocaleDateString('ru-RU') : '—';
        const dateEnd = t.completionDate ? new Date(t.completionDate).toLocaleDateString('ru-RU') : dateStart;
        
        const dateInfo = t.type === 'Бесплатная' 
            ? `<small class="text-muted">Пост:</small> ${dateStart}<br><small class="text-muted">Вып:</small> <span class="fw-bold text-dark">${dateEnd}</span>`
            : `<span class="fw-bold text-dark">${dateStart}</span>`;

        // Считаем деньги для конкретной строки
        let clientCost = '—';
        let premiumEarned = '—';
        
        if (t.type === 'Платная') {
            clientCost = `${t.price || 0} ₽`;
            premiumEarned = `<span class="text-success fw-bold">+${Math.round((t.price || 0) * 0.1)} ₽</span>`;
        } else if (t.type === 'Демо') {
            premiumEarned = `<span class="text-success fw-bold">+550 ₽</span>`;
        } else if (t.type === 'Бесплатная') {
            premiumEarned = `<span class="text-success fw-bold">+${freeRate} ₽</span>`;
        }

        rows += `
            <tr>
                <td class="ps-3 text-muted" style="font-size: 0.85rem;">#${t.id}</td>
                <td><span class="badge ${t.type==='Платная'?'bg-success-subtle text-success border border-success-subtle':(t.type==='Демо'?'bg-dark-subtle text-dark border border-dark-subtle':'bg-primary-subtle text-primary border border-primary-subtle')}">${t.type}</span></td>
                <td class="fw-bold text-dark text-wrap" style="max-width: 220px; font-size: 0.8rem; line-height: 1.2;">${t.task_name || '—'}</td>
                <td class="text-muted" style="font-size: 0.8rem;">${t.inn || '—'}</td>
                <td style="font-size: 0.8rem; line-height: 1.2;">${dateInfo}</td>
                <td style="font-size: 0.85rem; font-weight: 500;">${clientCost}</td>
                <td style="font-size: 0.85rem; background-color: rgba(25, 135, 84, 0.03);">${premiumEarned}</td>
            </tr>`;
    });

    container.innerHTML = `
        <table class="table table-hover align-middle mb-0">
            <thead class="table-light text-secondary" style="font-size: 0.7rem; text-transform: uppercase; position: sticky; top: 0; z-index: 2;">
                <tr>
                    <th class="ps-3 border-0" style="width: 70px;">ID</th>
                    <th class="border-0" style="width: 70px;">Тип</th>
                    <th class="border-0" style="width: 150px;">Название</th>
                    <th class="border-0" style="width: 100px;">ИНН</th>
                    <th class="border-0" style="width: 100px;">Дата</th>
                    <th class="border-0" style="width: 90px;">Оплата</th>
                    <th class="border-0" style="width: 90px;">Премия</th>
                </tr>
            </thead>
            <tbody>${rows || '<tr><td colspan=\"7\" class=\"text-center py-4 text-muted\">Задач не найдено</td></tr>'}</tbody>
        </table>`;

    new bootstrap.Modal(document.getElementById('detailsModal')).show();
};