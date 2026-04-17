let globalCatalog = [];
let globalSkills = [];
let isWheelListenerAdded = false;

async function loadTechSchedules() {
    const container = document.getElementById('admin-tech-list');
    if (!container) return;

    container.innerHTML = '<div class="w-100 text-center py-5 text-muted">Загрузка данных...</div>';

    try {
        const { data: users, error: userError } = await supabase
            .from('users')
            .select(`id, full_name, user_roles!inner(role_id, roles(role_name))`)
            .in('user_roles.role_id', [3, 4])
            .eq('is_active', true);
        if (userError) throw userError;

        const { data: settings, error: setError } = await supabase.from('specialist_settings').select('*');
        if (setError) throw setError;
        
        // Сортировка: Технари (3), 1С (4), по ID
        users.sort((a, b) => {
            const roleA = a.user_roles[0]?.role_id || 99;
            const roleB = b.user_roles[0]?.role_id || 99;
            if (roleA !== roleB) return roleA - roleB;
            return a.id.localeCompare(b.id);
        });

        const { data: catalog, error: catError } = await supabase
            .from('task_catalog')
            .select('id, category, task_name, task_type, is_paid')
            .eq('is_active', true)
            .order('order_index');
        if (catError) throw catError;
        globalCatalog = catalog;

        const { data: skills, error: skillError } = await supabase.from('specialist_skills').select('*');
        if (skillError) throw skillError;
        globalSkills = skills;

        // Группировка: Тип -> Категория -> Задачи
        const catalogTree = { paid: {}, free: {}, demo: {} };
        catalog.forEach(item => {
            let type = item.task_type || (item.is_paid ? 'paid' : 'free');
            if (!catalogTree[type][item.category]) catalogTree[type][item.category] = [];
            catalogTree[type][item.category].push(item);
        });

        let html = '';
        users.forEach(u => {
            const sch = settings.find(s => s.user_id === u.id);
            const role = u.user_roles?.[0]?.roles?.role_name || 'Технарь';
            const shortName = u.full_name.split(' ').slice(0, 2).join(' ');
            const is1C = u.user_roles?.[0]?.role_id === 4;
            const badgeClass = is1C ? 'bg-warning-subtle text-dark' : 'bg-primary-subtle text-primary';
            const scheduleStatus = sch ? `<span class="text-dark fw-bold">${sch.work_start.slice(0,5)} - ${sch.work_end.slice(0,5)}</span>` : '<span class="text-danger">Не задан</span>';

            let skillsHtml = '';
            
            // Отрисовка по группам типов
            ['paid', 'free', 'demo'].forEach(type => {
                const typeName = { paid: 'Платные услуги', free: 'Бесплатные', demo: 'Демонстрации' }[type];
                const categories = catalogTree[type];
                if (Object.keys(categories).length === 0) return;

                skillsHtml += `<div class="tech-group-title type-${type}">${typeName}</div>`;

                Object.keys(categories).forEach((category, idx) => {
                    const tasks = categories[category];
                    const userTaskIds = globalSkills.filter(sk => sk.user_id === u.id).map(sk => sk.task_id);
                    const categoryTaskIds = tasks.map(t => t.id);
                    const isAllChecked = categoryTaskIds.every(id => userTaskIds.includes(id));
                    const isSomeChecked = categoryTaskIds.some(id => userTaskIds.includes(id)) && !isAllChecked;

                    const collapseId = `col-${u.id}-${type}-${idx}`.replace(/\s+/g, '-');

                    skillsHtml += `
                        <div class="skill-category-wrapper">
                            <div class="category-header-btn" data-bs-toggle="collapse" data-bs-target="#${collapseId}" aria-expanded="false">
                                <input class="form-check-input skill-cb m-0 me-2" type="checkbox" 
                                    id="cat-${u.id}-${category}"
                                    ${isAllChecked ? 'checked' : ''} 
                                    ${isSomeChecked ? 'indeterminate' : ''}
                                    onclick="event.stopPropagation()"
                                    onchange="toggleCategorySkills('${u.id}', '${category}', this.checked)">
                                <label class="m-0 fw-bold text-dark text-truncate" style="font-size: 0.75rem; cursor:pointer;">${category}</label>
                                <svg class="category-arrow" width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                            </div>
                            <div class="collapse" id="${collapseId}">
                                <div class="p-2 pt-0">`;

                    tasks.forEach(task => {
                        const isChecked = userTaskIds.includes(task.id);
                        skillsHtml += `
                            <div class="service-row-card p-1 px-2 mb-1 d-flex align-items-center ${isChecked ? '' : 'opacity-75'}" 
                                 style="min-height: auto; cursor:pointer; border-radius: 4px;" 
                                 onclick="document.getElementById('task-${u.id}-${task.id}').click()">
                                <input class="form-check-input skill-cb m-0 me-2 flex-shrink-0" type="checkbox" 
                                    id="task-${u.id}-${task.id}"
                                    ${isChecked ? 'checked' : ''}
                                    style="width: 12px; height: 12px;"
                                    onclick="event.stopPropagation()"
                                    onchange="toggleSingleSkill('${u.id}', ${task.id}, '${category}', this.checked, this.parentElement)">
                                <span class="service-name text-truncate m-0" style="font-size: 0.7rem;">${task.task_name}</span>
                            </div>`;
                    });
                    skillsHtml += `</div></div></div>`;
                });
            });

            html += `
                <div class="tech-col-card">
                    <div class="tech-col-header">
                        <div class="d-flex justify-content-between align-items-start mb-2">
                            <div>
                                <div class="fw-bold text-truncate" style="font-size: 1.05rem; max-width: 220px;">${shortName}</div>
                                <div class="badge ${badgeClass}" style="font-size: 0.65rem;">${role}</div>
                            </div>
                            <button class="btn btn-sm btn-white border shadow-sm" onclick="openScheduleModal('${u.id}')">✏️</button>
                        </div>
                        <div class="bg-white rounded-3 p-2 small border shadow-sm" style="font-size: 0.75rem;">
                            <div class="d-flex justify-content-between mb-1"><span class="text-muted">Пн-Чт:</span><span>${scheduleStatus}</span></div>
                            <div class="d-flex justify-content-between mb-1"><span class="text-muted">Пятница:</span><span>${sch && sch.friday_end ? sch.friday_end.slice(0,5) : '—'}</span></div>
                            <div class="d-flex justify-content-between"><span class="text-muted">Обед:</span><span>${sch ? `${sch.lunch_start.slice(0,5)}-${sch.lunch_end.slice(0,5)}` : '—'}</span></div>
                        </div>
                    </div>
                    
                    <div class="tech-col-body">
                        <div class="d-flex justify-content-between align-items-center mb-1">
                            <span class="text-muted small fw-bold text-uppercase" style="font-size: 0.6rem;">Услуги:</span>
                            <button class="btn btn-light border btn-sm py-0 px-2" style="font-size: 0.65rem; background-color: #f8f9fa;" onclick="toggleAllCollapses(this.closest('.tech-col-card'))">Раскрыть все</button>
                        </div>
                        ${skillsHtml || '<div class="text-muted small">Услуг нет</div>'}
                    </div>
                </div>`;
        });

        container.innerHTML = html || '<div class="col-12 text-center text-muted">Список пуст</div>';
        document.querySelectorAll('.skill-cb[indeterminate]').forEach(cb => { cb.indeterminate = true; });

        // Скролл колесиком
        if (!isWheelListenerAdded) {
            container.addEventListener('wheel', e => {
                const isInsideList = e.target.closest('.tech-col-body');
                if (!isInsideList && e.deltaY !== 0) {
                    e.preventDefault();
                    container.scrollLeft += e.deltaY * 1.5;
                }
            }, { passive: false });
            isWheelListenerAdded = true;
        }

    } catch (err) { console.error(err); }
}

// Глобальная функция раскрытия всех списков внутри одной колонки
window.toggleAllCollapses = function(cardElement) {
    const collapses = cardElement.querySelectorAll('.collapse');
    const isAnyClosed = Array.from(collapses).some(c => !c.classList.contains('show'));
    
    collapses.forEach(c => {
        const instance = bootstrap.Collapse.getOrCreateInstance(c, { toggle: false });
        isAnyClosed ? instance.show() : instance.hide();
    });
};

// ==========================================
// ЛОГИКА СОХРАНЕНИЯ ГАЛОЧЕК
// ==========================================

window.toggleSingleSkill = async function(userId, taskId, category, isChecked, rowElement) {
    try {
        const cleanTaskId = Number(taskId);
        if (isChecked) {
            const { error } = await supabase.from('specialist_skills').insert([{ user_id: userId, task_id: cleanTaskId }]);
            if (error) throw error; 
            globalSkills.push({ user_id: userId, task_id: cleanTaskId });
            if(rowElement) rowElement.classList.remove('opacity-75');
        } else {
            const { error } = await supabase.from('specialist_skills').delete().match({ user_id: userId, task_id: cleanTaskId });
            if (error) throw error;
            globalSkills = globalSkills.filter(sk => !(sk.user_id === userId && sk.task_id === cleanTaskId));
            if(rowElement) rowElement.classList.add('opacity-75');
        }
        updateCategoryCheckboxVisual(userId, category);
    } catch (e) { console.error(e); }
};

window.toggleCategorySkills = async function(userId, category, isChecked) {
    try {
        const tasksInCategory = globalCatalog.filter(t => t.category === category);
        const taskIds = tasksInCategory.map(t => t.id);

        if (isChecked) {
            const existingTaskIds = globalSkills.filter(sk => sk.user_id === userId).map(sk => sk.task_id);
            const newIds = taskIds.filter(id => !existingTaskIds.includes(id));
            if (newIds.length > 0) {
                const inserts = newIds.map(id => ({ user_id: userId, task_id: id }));
                await supabase.from('specialist_skills').insert(inserts);
                globalSkills.push(...inserts);
            }
        } else {
            await supabase.from('specialist_skills').delete().eq('user_id', userId).in('task_id', taskIds);
            globalSkills = globalSkills.filter(sk => !(sk.user_id === userId && taskIds.includes(sk.task_id)));
        }

        tasksInCategory.forEach(task => {
            const cb = document.getElementById(`task-${userId}-${task.id}`);
            if (cb) {
                cb.checked = isChecked;
                const row = cb.closest('.service-row-card');
                isChecked ? row.classList.remove('opacity-75') : row.classList.add('opacity-75');
            }
        });
    } catch (e) { console.error(e); }
};

function updateCategoryCheckboxVisual(userId, category) {
    const tasksInCategory = globalCatalog.filter(t => t.category === category);
    const categoryTaskIds = tasksInCategory.map(t => t.id);
    const userTaskIds = globalSkills.filter(sk => sk.user_id === userId).map(sk => sk.task_id);
    const isAllChecked = categoryTaskIds.every(id => userTaskIds.includes(id));
    const isSomeChecked = categoryTaskIds.some(id => userTaskIds.includes(id)) && !isAllChecked;

    const catCb = document.getElementById(`cat-${userId}-${category}`);
    if (catCb) {
        catCb.checked = isAllChecked;
        catCb.indeterminate = isSomeChecked;
    }
}
// ==========================================
// ЛОГИКА СОХРАНЕНИЯ ГРАФИКА РАБОТЫ
// ==========================================

window.openScheduleModal = async function(userId) {
    const form = document.getElementById('tech-schedule-form');
    if (!form) return;
    form.reset();
    document.getElementById('sch-user-id').value = userId;

    const { data } = await supabase.from('specialist_settings').select('*').eq('user_id', userId).maybeSingle();
    if (data) {
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

    if (!scheduleData.work_start || !scheduleData.work_end) return alert("Заполните основные часы работы");

    btn.disabled = true;
    btn.innerText = "Сохранение... ⏳";

    try {
        const { error } = await supabase.from('specialist_settings').upsert(scheduleData, { onConflict: 'user_id' });
        if (error) throw error;
        bootstrap.Modal.getInstance(document.getElementById('techScheduleModal')).hide();
        loadTechSchedules();
    } catch (err) { alert("Ошибка сохранения: " + err.message); } 
    finally { btn.disabled = false; btn.innerText = "Сохранить график"; }
};