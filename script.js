// Данные подтягиваются из файла config.js
const GAS_URL = CONFIG.GAS_URL;
const managerData = {
    name: CONFIG.MANAGER.NAME,
    dept: CONFIG.MANAGER.DEPT
};

// Отображаем инфо о менеджере в шапке
document.getElementById('user-info').innerText = `${managerData.name} (${managerData.dept})`;

const specSelect = document.getElementById('specialist');
const dateInput = document.getElementById('date');
const timeSelect = document.getElementById('time');

// --- 1. ЗАГРУЗКА СВОБОДНЫХ СЛОТОВ ---
async function updateFreeSlots() {
    const spec = specSelect.value;
    const date = dateInput.value; 

    if (!spec || !date) return;

    timeSelect.disabled = true;
    timeSelect.innerHTML = '<option>Загрузка...</option>';
    
    try {
        const response = await fetch(`${GAS_URL}?action=getFreeSlots&specialist=${encodeURIComponent(spec)}&date=${date}`);
        const slots = await response.json();
        
        timeSelect.innerHTML = ''; 

        if (!slots || slots.length === 0) {
            timeSelect.innerHTML = '<option value="">Мест нет</option>';
        } else {
            timeSelect.disabled = false;
            timeSelect.innerHTML = '<option value="">Выберите время</option>';
            slots.forEach(slot => {
                const opt = document.createElement('option');
                opt.value = slot;
                opt.innerText = slot;
                timeSelect.appendChild(opt);
            });
        }
    } catch (e) {
        console.error("Ошибка слотов:", e);
        timeSelect.innerHTML = '<option value="">Ошибка связи</option>';
    }
}

specSelect.addEventListener('change', updateFreeSlots);
dateInput.addEventListener('change', updateFreeSlots);

// --- 2. ОТПРАВКА ФОРМЫ (СОЗДАНИЕ ЗАДАЧИ) ---
document.getElementById('task-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submit-btn');
    
    if (!timeSelect.value) {
        alert("Пожалуйста, выберите время из списка!");
        return;
    }

    btn.disabled = true;
    btn.innerText = "Отправка...";

    // Форматируем дату из YYYY-MM-DD в DD.MM.YYYY
    const [y, m, d] = dateInput.value.split('-');
    const formattedDate = `${d}.${m}.${y}`;

    const taskData = {
        action: 'create',
        manager: managerData.name,
        dept: managerData.dept,
        specialist: specSelect.value,
        date: formattedDate,
        time: timeSelect.value,
        category: document.getElementById('category').value,
        taskName: document.getElementById('taskName').value,
        inn: document.getElementById('inn').value,
        bitrix: document.getElementById('bitrix').value,
        price: document.getElementById('price').value
    };

    try {
        // Мы НЕ используем no-cors, чтобы прочитать результат записи
        const response = await fetch(GAS_URL, {
            method: 'POST',
            body: JSON.stringify(taskData)
        });
        
        const result = await response.json();

        if (result.result === 'success') {
            alert("Задача успешно добавлена в таблицу!");
            document.getElementById('task-form').reset();
            
            // Закрываем модальное окно
            const modalElement = document.getElementById('taskModal');
            const modal = bootstrap.Modal.getInstance(modalElement);
            if (modal) modal.hide();
            
            loadTasks(); // Обновляем список задач на странице
        } else {
            // Выводим конкретную причину ошибки из Google Script
            alert("ОШИБКА: " + (result.message || "Не удалось сохранить задачу. Возможно, время уже занято."));
        }
    } catch (error) {
        console.error("Критическая ошибка:", error);
        alert("Произошла ошибка при связи с сервером. Проверьте консоль.");
    } finally {
        btn.disabled = false;
        btn.innerText = "Забронировать время";
    }
});

// --- 3. ПОЛУЧЕНИЕ СПИСКА ЗАДАЧ ---
async function loadTasks() {
    const list = document.getElementById('task-list');
    list.innerHTML = '<tr><td colspan="7" class="text-center">Синхронизация с таблицей...</td></tr>';

    try {
        const res = await fetch(`${GAS_URL}?action=getManagerTasks&manager=${encodeURIComponent(managerData.name)}`);
        const tasks = await res.json();
        
        list.innerHTML = '';

        if (!tasks || tasks.length === 0) {
            list.innerHTML = '<tr><td colspan="7" class="text-center text-muted">У вас пока нет активных задач</td></tr>';
            return;
        }

        tasks.forEach(t => {
            const row = `
                <tr>
                    <td><small class="text-muted">${t.id}</small></td>
                    <td>${t.spec}</td>
                    <td>${t.task}</td>
                    <td>${t.date} | <strong>${t.time}</strong></td>
                    <td>${t.price} ₽</td>
                    <td><span class="badge ${t.status === 'Выполнено' ? 'bg-success' : 'bg-warning'}">${t.status}</span></td>
                    <td>
                        <button class="btn btn-sm btn-outline-danger" onclick="deleteTask('${t.id}', '${t.spec}')">✕</button>
                    </td>
                </tr>
            `;
            list.insertAdjacentHTML('beforeend', row);
        });
    } catch (e) {
        list.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Не удалось загрузить задачи</td></tr>';
    }
}

// --- 4. УДАЛЕНИЕ ЗАДАЧИ ---
async function deleteTask(taskId, specialist) {
    if (!confirm("Удалить бронирование? Строка в таблице будет очищена.")) return;

    try {
        const response = await fetch(GAS_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'delete',
                taskId: taskId,
                specialist: specialist
            })
        });
        
        const result = await response.json();
        if (result.result === 'deleted' || result.result === 'success') {
            alert("Бронь удалена");
            loadTasks();
        } else {
            alert("Ошибка при удалении: " + (result.message || "неизвестно"));
        }
    } catch (e) {
        alert("Ошибка связи при удалении");
    }
}

// Стартовая загрузка
window.onload = loadTasks;