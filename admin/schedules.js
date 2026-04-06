/**
 * ЛОГИКА УПРАВЛЕНИЯ ГРАФИКАМИ ТЕХНАРЕЙ
 */

// Загрузка списка технарей и их графиков
async function loadTechSchedules() {
    const container = document.getElementById('admin-tech-list');
    if (!container) return;

    container.innerHTML = '<div class="text-center py-5 text-muted">Загрузка данных...</div>';

    try {
        // 1. Загружаем только технарей (роли 3 и 4)
        const { data: users, error: userError } = await supabase
            .from('users')
            .select(`
                id, 
                full_name, 
                user_roles!inner(role_id, roles(role_name))
            `)
            .in('user_roles.role_id', [3, 4])
            .eq('is_active', true);

        if (userError) throw userError;

        // 2. Загружаем все настройки из таблицы specialist_settings
        const { data: settings, error: setError } = await supabase
            .from('specialist_settings')
            .select('*');

        if (setError) throw setError;

        // 3. Сопоставляем данные
        let html = '';
        users.forEach(u => {
    const sch = settings.find(s => s.user_id === u.id);
    const role = u.user_roles?.[0]?.roles?.role_name || 'Технарь';
    
    // ПРАВКА 1: Оставляем только Фамилию и Имя (убираем Отчество, если оно есть)
    const shortName = u.full_name.split(' ').slice(0, 2).join(' ');

    // ПРАВКА 2: Желтый бейдж для 1С (роль ID 4), остальные синие
    const is1C = u.user_roles?.[0]?.role_id === 4;
    const badgeClass = is1C ? 'bg-warning-subtle text-dark' : 'bg-primary-subtle text-primary';

    const scheduleStatus = sch 
        ? `<span class="text-dark fw-bold">${sch.work_start.slice(0,5)} - ${sch.work_end.slice(0,5)}</span>`
        : '<span class="text-danger small">График не задан</span>';

    html += `
        <div class="col-md-4 col-lg-3">
            <div class="card shadow-sm border-light-subtle h-100">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-start">
                        <div>
                            <div class="fw-bold text-truncate" style="max-width: 180px;">${shortName}</div>
                            <div class="badge ${badgeClass} mb-3" style="font-size: 0.7rem;">${role}</div>
                        </div>
                        <button class="btn btn-sm btn-light border shadow-sm" onclick="openScheduleModal('${u.id}')">
                            ✏️
                        </button>
                    </div>

                    <div class="p-2 bg-light rounded-3 small">
                        <div class="d-flex justify-content-between mb-1">
                            <span class="text-muted">Пн-Чт:</span>
                            <span>${scheduleStatus}</span>
                        </div>
                        <div class="d-flex justify-content-between mb-1">
                            <span class="text-muted">Пятница:</span>
                            <span>${sch ? sch.friday_end.slice(0,5) : '—'}</span>
                        </div>
                        <div class="d-flex justify-content-between mb-1">
                            <span class="text-muted">Обед:</span>
                            <span>${sch ? `${sch.lunch_start.slice(0,5)}-${sch.lunch_end.slice(0,5)}` : '—'}</span>
                        </div>
                        <div class="d-flex justify-content-between border-top mt-2 pt-1">
                            <span class="text-muted">Интервал:</span>
                            <span class="badge bg-white text-dark border">${sch?.slot_interval || 30} мин</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
});

        container.innerHTML = html || '<div class="col-12 text-center text-muted">Список пуст</div>';

    } catch (err) {
        console.error("Ошибка загрузки технарей:", err);
        container.innerHTML = `<div class="alert alert-danger small">Ошибка: ${err.message}</div>`;
    }
}

// Открытие модалки и загрузка текущих данных спеца
window.openScheduleModal = async function(userId) {
    const form = document.getElementById('tech-schedule-form');
    if (!form) return;
    
    form.reset();
    document.getElementById('sch-user-id').value = userId;

    // Стучимся в БД за конкретными настройками
    const { data, error } = await supabase
        .from('specialist_settings')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle(); // maybeSingle не кидает ошибку, если записи нет

    if (data) {
        // Заполняем поля (отрезаем секунды для input type="time")
        document.getElementById('sch-work-start').value = data.work_start?.slice(0,5) || "";
        document.getElementById('sch-work-end').value = data.work_end?.slice(0,5) || "";
        document.getElementById('sch-work-friday').value = data.friday_end?.slice(0,5) || "";
        document.getElementById('sch-lunch-start').value = data.lunch_start?.slice(0,5) || "";
        document.getElementById('sch-lunch-end').value = data.lunch_end?.slice(0,5) || "";
        document.getElementById('sch-slot').value = data.slot_interval || "30";
    }

    const modal = new bootstrap.Modal(document.getElementById('techScheduleModal'));
    modal.show();
};

// Сохранение данных (создание или обновление)
window.saveTechSchedule = async function() {
    const btn = event.target;
    const userId = document.getElementById('sch-user-id').value;

    const scheduleData = {
        user_id: userId,
        work_start: document.getElementById('sch-work-start').value,
        work_end: document.getElementById('sch-work-end').value,
        friday_end: document.getElementById('sch-work-friday').value,
        lunch_start: document.getElementById('sch-lunch-start').value,
        lunch_end: document.getElementById('sch-lunch-end').value,
        slot_interval: parseInt(document.getElementById('sch-slot').value)
    };

    // Простая валидация
    if (!scheduleData.work_start || !scheduleData.work_end) {
        return alert("Заполните основные часы работы");
    }

    btn.disabled = true;

    try {
        // Используем upsert: если user_id есть — обновит, если нет — создаст
        const { error } = await supabase
            .from('specialist_settings')
            .upsert(scheduleData, { onConflict: 'user_id' });

        if (error) throw error;

        // Закрываем модалку и обновляем список
        const modalElement = document.getElementById('techScheduleModal');
        const modalInstance = bootstrap.Modal.getInstance(modalElement);
        modalInstance.hide();
        
        loadTechSchedules();

    } catch (err) {
        alert("Ошибка сохранения: " + err.message);
    } finally {
        btn.disabled = false;
    }
};