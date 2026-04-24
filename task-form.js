let editMode = false;
let editTaskId = null;

// Функция-загрузчик данных из БД
async function loadTaskCatalog() {
    const { data: catalog, error: catError } = await supabase
        .from('task_catalog')
        .select('*')
        .eq('is_active', true);

    if (catError) return console.error("Ошибка каталога:", catError);
    
    const { data: skills, error: skillError } = await supabase
        .from('specialist_skills')
        .select('*');
        
    if (skillError) console.error("Ошибка навыков:", skillError);
    
    window.taskCatalog = catalog; 
    window.specialistSkills = skills || [];
    console.log("Каталог и навыки загружены");
}

// 1. ДЕЛЕГИРОВАНИЕ ОТПРАВКИ ФОРМЫ (чтобы работало на динамической модалке)
document.addEventListener('submit', async (e) => {
    if (e.target && e.target.id === 'task-form') {
        e.preventDefault();
        const btn = document.getElementById('submit-btn');
        btn.disabled = true;

        const taskBillingType = document.getElementById('hiddenTaskType').value;
        const targetTable = taskBillingType === 'free' ? 'free_tasks' : 'tasks';

        // Собираем текущую задачу из полей
        const durParts = document.getElementById('taskDuration')?.value.split(':').map(Number) || [0, 30];
        const currentDuration = (durParts[0] * 60) + durParts[1];

        const taskData = {
            category: document.getElementById('category')?.value || 'Демонстрация',
            task_name: document.getElementById('taskName').value,
            specialist: document.getElementById('specialist').value,
            inn: document.getElementById('inn').value,
            bitrix_url: document.getElementById('bitrix').value,
            duration: currentDuration,
            price: parseInt(document.getElementById('price')?.value) || 0,
            comment: document.getElementById('taskComment')?.value || '',
            date: document.getElementById('date').value,
            time: document.getElementById('time')?.value,
            status: 'Новая',
            manager: currentUser.name,
            dept: currentUser.dept
        };

        let tasksToSave = [];

        if (editMode) {
            // Редактирование: оставляем как было (по одной задаче)
            const historyCommentValue = document.getElementById('historyComment')?.value || '';
            const { data: oldTask } = await supabase.from(targetTable).select('*').eq('id', editTaskId).single();
            
            // (Здесь остается твоя логика сравнения старых и новых данных для истории...)
            // ...

            const { error } = await supabase.from(targetTable).update(taskData).eq('id', editTaskId);
            if (!error) {
                bootstrap.Modal.getInstance(document.getElementById('taskModal')).hide();
            } else {
                alert("Ошибка обновления");
            }
        } else {
            // СОЗДАНИЕ (одиночное или цепочка)
            // 1. Принудительно сохраняем то, что прямо сейчас введено в форму
            if (typeof window.taskChain !== 'undefined' && window.taskChain.length > 0) {
                window.taskChain[window.activeChainIndex || 0] = taskData;
                
                // ПРОВЕРКА ЦЕПОЧКИ: Все ли свернутые задачи дозаполнены?
                const invalidIndex = window.taskChain.findIndex(t => !t.task_name || !t.specialist || !t.inn || !t.date || !t.time);
                if (invalidIndex !== -1 && window.taskChain.length > 1) {
                    alert(`Невозможно сохранить: задача #${invalidIndex + 1} заполнена не полностью!\nРазверните её и заполните обязательные поля.`);
                    btn.disabled = false;
                    return; // Блокируем отправку в БД
                }
            }

            // 2. Генерируем ID только если задач больше одной
            const chainId = (window.taskChain && window.taskChain.length > 1) ? crypto.randomUUID() : null;
            
            // 3. Собираем всё из памяти в финальный массив
            if (typeof window.taskChain !== 'undefined' && window.taskChain.length > 0) {
                window.taskChain.forEach(t => {
                    const { billing_type, ...safeTask } = t; 
                    // Защита: сохраняем только задачи с названием
                    if (safeTask.task_name) {
                        tasksToSave.push({ ...safeTask, chain_id: chainId, manager: currentUser.name, dept: currentUser.dept, status: 'Новая' });
                    }
                });
            } else {
                // Страховка для одиночной задачи
                tasksToSave.push({ ...taskData, chain_id: chainId, manager: currentUser.name, dept: currentUser.dept, status: 'Новая' });
            }

            const { data: savedTasks, error } = await supabase.from(targetTable).insert(tasksToSave).select();

            if (!error) {
                for (const t of savedTasks) {
                    await logTaskAction(t.id, 'create', null, chainId ? "Создано в цепочке" : taskData.comment);
                }
                window.taskChain = [];
                window.activeChainIndex = 0;
                
                const modalEl = document.getElementById('taskModal');
                if (modalEl) {
                    const inst = bootstrap.Modal.getInstance(modalEl);
                    if (inst) inst.hide();
                }
                
                setTimeout(() => {
                    document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
                    document.body.classList.remove('modal-open');
                    document.body.style.overflow = '';
                    document.body.style.paddingRight = '';
                }, 300);
            } else {
                console.error(error);
                alert("Ошибка сохранения: " + error.message);
            }
        }
        btn.disabled = false;
    }
});

// 2. ИНИЦИАЛИЗАЦИЯ ДИНАМИЧЕСКОЙ МОДАЛКИ
document.addEventListener('dynamicModalReady', async (e) => {
    const { type, isEdit } = e.detail;

    // ПРИНУДИТЕЛЬНО ГРУЗИМ КАТАЛОГ, ЕСЛИ ЕГО НЕТ
    if (!window.taskCatalog) {
        await loadTaskCatalog();
    }

    // Инициализация календаря (ИСПРАВЛЕН ID НА 'date')
    const dateInput = document.getElementById('date');
    if (dateInput) {
        flatpickr(dateInput, {
            ...flatpickrConfig,
            onChange: () => { if (typeof updateFreeSlots === 'function') updateFreeSlots(); }
        });
    }

    // Заполнение категорий
    const catSelect = document.getElementById('category');
    const taskSelect = document.getElementById('taskName');
    const specSelect = document.getElementById('specialist');

    window.smartUpdateDropdowns = function(source) {
        const currentCat = catSelect ? catSelect.value : 'Демонстрация';
        const currentTask = taskSelect ? taskSelect.value : '';
        const currentSpec = specSelect ? specSelect.value : '';

        let specId = null;
        if (currentSpec && CONFIG.USERS) {
            const u = CONFIG.USERS.find(x => x.name === currentSpec);
            if (u) specId = u.id;
        }

        if (source === 'init' || source === 'specialist') {
            let allowedTasks = window.taskCatalog.filter(t => t.task_type === type);
            
            if (specId) {
                const specTaskIds = window.specialistSkills.filter(s => s.user_id === specId).map(s => s.task_id);
                allowedTasks = allowedTasks.filter(t => specTaskIds.includes(t.id));
            }

            if (catSelect && catSelect.tagName === 'SELECT') {
                const cats = [...new Set(allowedTasks.map(t => t.category))].sort();
                catSelect.innerHTML = '<option value="">Выберите категорию...</option>';
                cats.forEach(c => catSelect.add(new Option(c, c)));
                if (cats.includes(currentCat)) catSelect.value = currentCat;
                else if (cats.length === 1) catSelect.value = cats[0]; 
            }

            if (taskSelect) {
                const activeCat = (catSelect && catSelect.tagName === 'SELECT') ? catSelect.value : 'Демонстрация';
                const finalTasks = allowedTasks.filter(t => type === 'demo' ? true : t.category === activeCat);
                taskSelect.innerHTML = '<option value="">Выберите задачу...</option>';
                finalTasks.forEach(t => {
                    const opt = new Option(t.task_name, t.task_name);
                    opt.dataset.duration = t.default_duration;
                    opt.dataset.price = t.default_price || 0;
                    taskSelect.add(opt);
                });
                if (finalTasks.some(t => t.task_name === currentTask)) taskSelect.value = currentTask;
            }
        }

        if (source === 'category') {
            let allowedTasks = window.taskCatalog.filter(t => t.task_type === type && t.category === currentCat);
            if (specId) {
                const specTaskIds = window.specialistSkills.filter(s => s.user_id === specId).map(s => s.task_id);
                allowedTasks = allowedTasks.filter(t => specTaskIds.includes(t.id));
            }
            if (taskSelect) {
                taskSelect.innerHTML = '<option value="">Выберите задачу...</option>';
                allowedTasks.forEach(t => {
                    const opt = new Option(t.task_name, t.task_name);
                    opt.dataset.duration = t.default_duration;
                    opt.dataset.price = t.default_price || 0;
                    taskSelect.add(opt);
                });
                if (allowedTasks.some(t => t.task_name === currentTask)) taskSelect.value = currentTask;
            }
        }

        if (source !== 'specialist') {
            const newTask = taskSelect ? taskSelect.value : '';
            let allowedSpecIds = null;

            if (newTask) {
                const t = window.taskCatalog.find(x => x.task_name === newTask && x.task_type === type);
                if (t) allowedSpecIds = window.specialistSkills.filter(s => s.task_id === t.id).map(s => s.user_id);
            } else if (currentCat && currentCat !== 'Демонстрация') {
                const catTaskIds = window.taskCatalog.filter(t => t.category === currentCat && t.task_type === type).map(t => t.id);
                allowedSpecIds = window.specialistSkills.filter(s => catTaskIds.includes(s.task_id)).map(s => s.user_id);
            }

            if (specSelect && CONFIG.USERS) {
                const techUsers = CONFIG.USERS.filter(u => u.role === 'specialist' || u.role === 'specialist_1c');
                let availableSpecs = allowedSpecIds ? techUsers.filter(u => allowedSpecIds.includes(u.id)) : techUsers;
                
                specSelect.innerHTML = '<option value="">Выберите специалиста...</option>';
                availableSpecs.forEach(s => specSelect.add(new Option(s.name, s.name)));
                if (availableSpecs.some(s => s.name === currentSpec)) specSelect.value = currentSpec;
            }
        }
        // Обновляем длительность синхронно ДО запроса свободных слотов, чтобы не было сброса времени
        if (source === 'task' && taskSelect) {
            const selectedOption = taskSelect.options[taskSelect.selectedIndex];
            if (selectedOption) {
                const duration = selectedOption.getAttribute('data-duration') || 30;
                const durationInput = document.getElementById('taskDuration');
                if (durationInput) {
                    const hh = String(Math.floor(duration / 60)).padStart(2, '0');
                    const mm = String(duration % 60).padStart(2, '0');
                    durationInput.value = `${hh}:${mm}`;
                }
            }
        }

        if (typeof updateFreeSlots === 'function' && source !== 'init') {
            const cTime = document.getElementById('time')?.value;
            updateFreeSlots(cTime);
        }
    };

    if (catSelect) catSelect.onchange = () => window.smartUpdateDropdowns('category');
    if (taskSelect) taskSelect.addEventListener('change', () => window.smartUpdateDropdowns('task'));
    if (specSelect) specSelect.onchange = () => window.smartUpdateDropdowns('specialist');

    window.smartUpdateDropdowns('init');
});



// 4. ДЕЛЕГИРОВАНИЕ ЗАКРЫТИЯ МОДАЛКИ
document.addEventListener('hidden.bs.modal', (e) => {
    if (e.target && e.target.id === 'taskModal') {
        editMode = false;
        editTaskId = null;
        window.taskChain = []; // Сбрасываем цепочку при закрытии крестиком
        
        // Удаляем модалку из DOM, чтобы она не плодилась и не оставляла мусор
        document.getElementById('dynamic-modal-container').innerHTML = '';
    }
});

// Функция для записи истории действий
async function logTaskAction(taskId, actionType, changes = null, comment = null) {
    try {
        const historyData = {
            task_id: taskId,
            user_name: currentUser.name,
            user_role: currentUser.role,
            action_type: actionType,
            changes: changes,
            comment: comment
        };
        const { error } = await supabase.from('task_history').insert([historyData]);
        if (error) throw error;
    } catch (e) {
        console.error("Ошибка записи истории:", e);
    }
}