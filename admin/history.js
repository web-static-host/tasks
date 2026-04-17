// ==========================================
// ЛОГИКА ВКЛАДКИ "ИСТОРИЯ"
// ==========================================
let globalHistoryData = [];

window.loadAdminHistory = async function() {
    const container = document.getElementById('admin-history-list');
    if (!container) return;

    container.innerHTML = '<div class="text-center py-5 text-muted">Загрузка истории...</div>';

    try {
        const { data, error } = await supabase
            .from('task_history')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(300); 

        if (error) throw error;

        // ХИТРОСТЬ: Собираем ID задач и быстро узнаем их тип из основных таблиц
        const taskIds = [...new Set((data || []).map(item => item.task_id))];
        let taskTypeMap = {};
        
        if (taskIds.length > 0) {
            const [paidRes, freeRes] = await Promise.all([
                supabase.from('tasks').select('id, category').in('id', taskIds),
                supabase.from('free_tasks').select('id').in('id', taskIds)
            ]);
            
            paidRes.data?.forEach(t => {
                taskTypeMap[t.id] = t.category === 'Демонстрация' ? 'Демо' : 'Платная';
            });
            freeRes.data?.forEach(t => {
                taskTypeMap[t.id] = 'Бесплатная';
            });
        }

        // Записываем тип прямо в объект истории, чтобы по нему работал поиск
        globalHistoryData = (data || []).map(item => ({
            ...item,
            task_type: taskTypeMap[item.task_id] || 'Удалена'
        }));

        renderAdminHistory();
    } catch (err) {
        console.error('Ошибка загрузки истории:', err);
        container.innerHTML = '<div class="text-danger text-center py-3">Ошибка загрузки данных</div>';
    }
};

window.filterAdminHistory = function() {
    renderAdminHistory();
};

function renderAdminHistory() {
    const container = document.getElementById('admin-history-list');
    if (!container) return;

    const searchTerm = (document.getElementById('history-search')?.value || '').toLowerCase();

    const filteredData = globalHistoryData.filter(item => {
        if (!searchTerm) return true;
        const textStr = `
            ${item.task_id} 
            ${item.task_type}
            ${item.user_name} 
            ${item.action_type} 
            ${item.comment || ''}
        `.toLowerCase();
        return textStr.includes(searchTerm);
    });

    if (filteredData.length === 0) {
        container.innerHTML = '<div class="text-center py-4 text-muted">Ничего не найдено</div>';
        return;
    }

    // Добавили table-sm для компактности по высоте
    let html = `
        <table class="table table-sm table-hover align-middle mb-0">
            <thead class="table-light text-secondary" style="font-size: 0.7rem; position: sticky; top: 0; z-index: 2;">
                <tr>
                    <th style="width: 110px;">ДАТА</th>
                    <th style="width: 80px;">ЗАДАЧА</th>
                    <th style="width: 90px;">ТИП</th>
                    <th style="width: 160px;">СОТРУДНИК</th>
                    <th style="width: 130px;">ДЕЙСТВИЕ</th>
                    <th>ИЗМЕНЕНИЯ</th>
                    <th style="width: 200px;">ПРИМЕЧАНИЕ</th>
                </tr>
            </thead>
            <tbody style="font-size: 0.75rem;">
    `;

    filteredData.forEach(item => {
        const dateStr = new Date(item.created_at).toLocaleString('ru-RU', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        let actionBadge = '';
        if (item.action_type === 'create') actionBadge = '<span class="badge bg-success-subtle text-success border border-success-subtle">Создание</span>';
        else if (item.action_type === 'update') actionBadge = '<span class="badge bg-warning-subtle text-warning border border-warning-subtle">Обновление</span>';
        else if (item.action_type === 'status_change') actionBadge = '<span class="badge bg-info-subtle text-info border border-info-subtle">Смена статуса</span>';
        else if (item.action_type === 'reschedule') actionBadge = '<span class="badge bg-primary-subtle text-primary border border-primary-subtle">Перенос</span>';
        else actionBadge = `<span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle">${item.action_type}</span>`;

        let changesHtml = '<span class="opacity-50">—</span>';
        if (item.changes) {
            const labels = {
                status: 'Статус', price: 'Цена', date: 'Дата', time: 'Время',
                duration: 'Длит.', comment: 'Коммент', inn: 'ИНН', bitrix_url: 'Битрикс', specialist: 'Спец'
            };
            const changesArr = [];
            
            Object.entries(item.changes).forEach(([key, val]) => {
                const label = labels[key] || key;
                let n = val.new !== undefined ? val.new : val;
                let o = val.old;

                if (key === 'price') { n += ' ₽'; if(o !== undefined) o += ' ₽'; }
                if (key === 'duration') {
                    const toText = (m) => {
                        const hrs = Math.floor(m / 60); const mins = m % 60;
                        return `${hrs > 0 ? hrs + ' ч ' : ''}${mins > 0 ? mins + ' мин' : (hrs > 0 ? '' : '0 мин')}`.trim();
                    };
                    n = toText(n);
                    if(o !== undefined) o = toText(o);
                }
                if (key === 'date') {
                    n = new Date(n).toLocaleDateString('ru-RU', {day:'2-digit', month:'2-digit', year:'numeric'});
                    if(o) o = new Date(o).toLocaleDateString('ru-RU', {day:'2-digit', month:'2-digit', year:'numeric'});
                }

                if (o !== undefined && o !== null) {
                    changesArr.push(`<span class="text-muted">${label}:</span> <s class="text-danger opacity-75">${o}</s> <span class="text-muted mx-1">➔</span> <b class="text-dark">${n}</b>`);
                } else {
                    changesArr.push(`<span class="text-muted">${label}:</span> <b class="text-dark">${n}</b>`);
                }
            });
            
            if (changesArr.length > 0) {
                // Убрали внешние отступы и полоску для компактности
                changesHtml = `<div style="line-height: 1.2;">${changesArr.join('<br>')}</div>`;
            }
        }

        // Бейджик типа задачи
        let typeBadge = '';
        if (item.task_type === 'Платная') typeBadge = '<span class="badge bg-success-subtle text-success border border-success-subtle">Платная</span>';
        else if (item.task_type === 'Бесплатная') typeBadge = '<span class="badge bg-primary-subtle text-primary border border-primary-subtle">Беспл.</span>';
        else if (item.task_type === 'Демо') typeBadge = '<span class="badge bg-dark-subtle text-dark border border-dark-subtle">Демо</span>';
        else typeBadge = `<span class="badge bg-secondary-subtle text-secondary" title="Задача удалена">${item.task_type}</span>`;

        html += `
            <tr>
                <td class="text-muted py-1">${dateStr}</td>
                <td class="py-1"><b class="text-primary">#${item.task_id}</b></td>
                <td class="py-1">${typeBadge}</td>
                <td class="py-1">
                    <div class="fw-bold text-dark text-truncate" style="max-width: 150px;">${item.user_name}</div>
                    <div class="text-muted" style="font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.5px;">${item.user_role || 'Сотрудник'}</div>
                </td>
                <td class="py-1">${actionBadge}</td>
                <td class="py-1">${changesHtml}</td>
                <td class="text-muted py-1" style="max-width: 200px; white-space: normal; line-height: 1.2;">
                    ${item.comment ? `<div class="text-dark" style="font-style: italic;">💬 ${item.comment}</div>` : '<span class="opacity-50">—</span>'}
                </td>
            </tr>
        `;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
}