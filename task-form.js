let editMode = false;
let editTaskId = null;

// Функция-загрузчик данных из БД
async function loadTaskCatalog() {
    const { data, error } = await supabase
        .from('task_catalog')
        .select('*')
        .eq('is_active', true);

    if (error) return console.error("Ошибка каталога:", error);
    
    window.taskCatalog = data; 
    console.log("Каталог задач загружен из БД");
}

// 1. ДЕЛЕГИРОВАНИЕ ОТПРАВКИ ФОРМЫ (чтобы работало на динамической модалке)
document.addEventListener('submit', async (e) => {
    if (e.target && e.target.id === 'task-form') {
        e.preventDefault();
        const btn = document.getElementById('submit-btn');
        btn.disabled = true;

        const taskBillingType = document.getElementById('hiddenTaskType').value;
        const targetTable = taskBillingType === 'free' ? 'free_tasks' : 'tasks';

        const categoryValue = document.getElementById('category')?.value || 'Демонстрация';
        const taskNameValue = document.getElementById('taskName').value;
        const historyCommentValue = document.getElementById('historyComment')?.value || null;
        
        const durationInput = document.getElementById('taskDuration')?.value || "00:30";
        const [h, m] = durationInput.split(':').map(Number);
        let totalMinutes = (h * 60) + m;
        
        if (totalMinutes < 30) totalMinutes = 30;

        const taskData = {
            specialist: document.getElementById('specialist').value,
            category: categoryValue,
            task_name: taskNameValue,
            inn: document.getElementById('inn').value,
            bitrix_url: document.getElementById('bitrix').value,
            duration: totalMinutes 
        };

        if (taskBillingType === 'free') {
            delete taskData.duration;
        }

        if (taskBillingType === 'paid' || taskBillingType === 'demo') {
            const spec = document.getElementById('specialist').value;
            const timeValue = document.getElementById('time').value;
            const dateValue = document.querySelector("#date")._flatpickr.selectedDates[0];
            const formattedDate = document.querySelector("#date")._flatpickr.formatDate(dateValue, "Y-m-d");

            const [h, m] = timeValue.split(':').map(Number);
            const newStart = h * 60 + m;
            const newEnd = newStart + totalMinutes;

            const specConfig = CONFIG.SPECIALISTS[spec];
            if (specConfig && specConfig.lunch) {
                const [lsH, lsM] = specConfig.lunch.start.split(':').map(Number);
                const [leH, leM] = specConfig.lunch.end.split(':').map(Number);
                const lStart = lsH * 60 + lsM;
                const lEnd = leH * 60 + leM;

                if (newStart < lEnd && newEnd > lStart) {
                    alert(`❌ Ошибка! Это время задевает обед ${spec} (${specConfig.lunch.start}-${specConfig.lunch.end})`);
                    btn.disabled = false;
                    return;
                }
            }
            
            const isFridaySubmit = dateValue.getDay() === 5;
            const endStrSubmit = (isFridaySubmit && specConfig.friday_end) ? specConfig.friday_end : specConfig.end;
            const [weH, weM] = endStrSubmit.split(':').map(Number);
            const workDayEndMinutes = weH * 60 + weM;

            if (newEnd > workDayEndMinutes) {
                alert(`❌ Ошибка! Задача выходит за пределы рабочего времени. В ${isFridaySubmit ? 'пятницу' : 'этот день'} техник работает до ${endStrSubmit}`);
                btn.disabled = false;
                return;
            }

            const { data: others } = await supabase.from('tasks')
                .select('id, time, duration, status')
                .eq('specialist', spec)
                .eq('date', formattedDate);

            const freeStatuses = ['Выполнено', 'Возврат', 'Ожидание от клиента', 'Ожидание от менеджера', 'Ожидание от тех.спеца', 'Не отвечает'];

            const conflict = others?.find(t => {
                if (editMode && String(t.id) === String(editTaskId)) return false;
                if (freeStatuses.includes(t.status)) return false; 

                const [th, tm] = t.time.substring(0, 5).split(':').map(Number);
                const tStart = th * 60 + tm;
                const tEnd = tStart + (Number(t.duration) || 30);
                return newStart < tEnd && newEnd > tStart;
            });

            if (conflict) {
                alert(`❌ Ошибка! Это время занято другой задачей (с ${conflict.time.substring(0, 5)}). Уменьшите длительность или выберите другое время.`);
                btn.disabled = false;
                return;
            }
        }

        if (!editMode) {
            taskData.manager = currentUser.name;
            taskData.dept = currentUser.dept;
            taskData.status = 'Новая';
        }

        if (taskBillingType === 'paid' || taskBillingType === 'demo') {
            const fp = document.querySelector("#date")._flatpickr;
            taskData.date = fp.formatDate(fp.selectedDates[0], "Y-m-d");
            taskData.time = document.getElementById('time').value;
            taskData.price = taskBillingType === 'demo' ? 0 : (parseInt(document.getElementById('price').value) || 0);
            taskData.comment = document.getElementById('taskComment').value;
        } else {
            // Для бесплатных задач ставим сегодняшнюю дату ТОЛЬКО при создании!
            if (!editMode) {
                taskData.date = new Date().toISOString().split('T')[0];
            }
        }

        let result;
        if (editMode) {
            const { data: oldTask } = await supabase.from(targetTable).select('*').eq('id', editTaskId).single();

            if (!result?.error && oldTask) {
                const diff = {};
                if (oldTask.inn !== taskData.inn) diff.inn = { old: oldTask.inn, new: taskData.inn };
                if (oldTask.bitrix_url !== taskData.bitrix_url) diff.bitrix = { old: oldTask.bitrix_url, new: taskData.bitrix_url };
                if (oldTask.price !== taskData.price) diff.price = { old: oldTask.price, new: taskData.price };
                if (oldTask.specialist !== taskData.specialist) diff.specialist = { old: oldTask.specialist, new: taskData.specialist };
                if (oldTask.date !== taskData.date) diff.date = { old: oldTask.date, new: taskData.date };
                
                const oldT = oldTask.time?.substring(0, 5);
                if (oldT !== taskData.time) { 
                    diff.time = { old: oldT, new: taskData.time };
                    taskData.status = 'Перенесен'; 
                    if (oldTask.status !== 'Перенесен') {
                        diff.status = { old: oldTask.status, new: 'Перенесен' };
                    }
                }

                if (taskData.status === 'Перенесен' && oldTask.status !== 'Перенесен') {
                    diff.status = { old: oldTask.status, new: 'Перенесен' };
                }
                
                if (taskData.duration !== undefined && Number(oldTask.duration) !== Number(taskData.duration)) {
                    diff.duration = { old: oldTask.duration, new: taskData.duration };
                }

                if (Object.keys(diff).length > 0) {
                    await logTaskAction(editTaskId, 'update', diff, historyCommentValue); 
                }
            }
            result = await supabase.from(targetTable).update(taskData).eq('id', editTaskId);
        } else {
            result = await supabase.from(targetTable).insert([taskData]).select();
            if (!result.error && result.data) {
                const newId = result.data[0].id;
                let cmt = taskData.comment;
                if (taskNameValue.includes('(Копия)')) cmt = "Создано через копирование";
                await logTaskAction(newId, 'create', null, cmt);
            }
        }

        if (!result.error) {
            bootstrap.Modal.getInstance(document.getElementById('taskModal')).hide();
            if (typeof currentTable !== 'undefined') currentTable = targetTable;
        } else {
            alert("Ошибка при сохранении");
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
    
    if (catSelect && catSelect.tagName === 'SELECT') {
        catSelect.innerHTML = '<option value="">Выберите категорию...</option>';
        
        const categories = [...new Set(
            window.taskCatalog
                .filter(item => item.task_type === type)
                .map(item => item.category)
        )].sort();

        categories.forEach(cat => {
            catSelect.add(new Option(cat, cat));
        });

        // Обновление задач при выборе категории
        catSelect.onchange = () => {
            const selectedCat = catSelect.value;
            taskSelect.innerHTML = '<option value="">Выберите задачу...</option>';
            
            const filteredTasks = window.taskCatalog.filter(t => 
                t.category === selectedCat && t.task_type === type
            );

            filteredTasks.forEach(t => {
                const opt = new Option(t.task_name, t.task_name);
                opt.dataset.duration = t.default_duration;
                opt.dataset.price = t.default_price || 0;
                taskSelect.add(opt);
            });
            
            if (typeof updateFreeSlots === 'function') updateFreeSlots();
        };
    } else if (type === 'demo') {
        // Если это демо, сразу подгружаем задачи
        taskSelect.innerHTML = '<option value="">Выберите задачу...</option>';
        const filteredTasks = window.taskCatalog.filter(t => t.task_type === 'demo');
        filteredTasks.forEach(t => {
            const opt = new Option(t.task_name, t.task_name);
            opt.dataset.duration = t.default_duration;
            taskSelect.add(opt);
        });
    }
});

// 3. ДЕЛЕГИРОВАНИЕ СОБЫТИЙ CHANGE (Длительность и слоты)
document.addEventListener('change', (e) => {
    // Авто-подстановка времени при выборе конкретной задачи
    if (e.target && e.target.id === 'taskName') {
        const selectedOption = e.target.options[e.target.selectedIndex];
        if (!selectedOption) return;
        
        const duration = selectedOption.getAttribute('data-duration') || 30;
        const durationInput = document.getElementById('taskDuration');

        if (durationInput) {
            const hh = String(Math.floor(duration / 60)).padStart(2, '0');
            const mm = String(duration % 60).padStart(2, '0');
            durationInput.value = `${hh}:${mm}`;
            
            if (typeof updateFreeSlots === 'function') updateFreeSlots();
        }
    }
});

// 4. ДЕЛЕГИРОВАНИЕ ЗАКРЫТИЯ МОДАЛКИ
document.addEventListener('hidden.bs.modal', (e) => {
    if (e.target && e.target.id === 'taskModal') {
        editMode = false;
        editTaskId = null;
        
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