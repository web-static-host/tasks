
// --- 1. УПРАВЛЕНИЕ СОТРУДНИКАМИ ---
async function loadAdminUsers() {
    const container = document.getElementById('admin-users-list');
    if (!container) return;

    // Читаем значения фильтров из HTML
    const searchTerm = document.getElementById('user-search')?.value.toLowerCase() || "";
    const roleFilter = document.getElementById('role-filter')?.value || "";
    
    // Проверяем состояние галочки "Только активные"
    const hideInactiveCheck = document.getElementById('hide-inactive-check');
    const onlyActive = hideInactiveCheck ? hideInactiveCheck.checked : false;

    // Базовый запрос к Supabase
    let query = supabase
        .from('users')
        .select('*, user_roles(roles(role_name))')
        .order('full_name');

    // Если включена галочка, фильтруем неактивных на уровне базы (эффективнее)
    if (onlyActive) {
        query = query.eq('is_active', true);
    }

    const { data: users, error } = await query;
    if (error) return console.error(error);

    // Локальная фильтрация по Поиску и Ролям
    const filteredUsers = users.filter(u => {
        const matchesSearch = u.full_name.toLowerCase().includes(searchTerm) || 
                              u.email.toLowerCase().includes(searchTerm);
        
        const userRoles = u.user_roles?.map(ur => ur.roles?.role_name) || [];
        const matchesRole = roleFilter === "" || userRoles.includes(roleFilter);

        return matchesSearch && matchesRole;
    });

    let html = `<table class="table table-hover align-middle shadow-sm mt-2">
        <thead class="table-light text-secondary" style="font-size: 0.8rem;">
            <tr>
                <th>ФИО / EMAIL</th>
                <th>ОТДЕЛ</th>
                <th>РОЛИ</th>
                <th>СТАТУС</th>
                <th class="text-end px-3">ДЕЙСТВИЯ</th>
            </tr>
        </thead>
        <tbody>`;

    if (filteredUsers.length === 0) {
        html += `<tr><td colspan="5" class="text-center py-4 text-muted">Сотрудники не найдены</td></tr>`;
    }

    filteredUsers.forEach(u => {
        const rolesHtml = u.user_roles?.map(ur => getRoleBadge(ur.roles?.role_name)).join(' ') || '-';
        const isActive = u.is_active !== false;
        
        html += `
            <tr class="${!isActive ? 'opacity-75 bg-light' : ''}">
                <td><strong>${u.full_name}</strong><br><small class="text-muted">${u.email}</small></td>
                <td><span class="badge bg-light text-dark border">${u.dept || '-'}</span></td>
                <td>${rolesHtml}</td>
                <td>
                    ${isActive 
                        ? '<span class="badge bg-success-subtle text-success border border-success-subtle">Активен</span>' 
                        : '<span class="badge bg-danger-subtle text-danger border border-danger-subtle">Заблокирован</span>'}
                </td>
                <td class="text-end px-3">
                    <div class="btn-group shadow-sm" role="group">
                        <button class="btn btn-sm btn-white border" onclick="openEditUserModal('${u.id}')" title="Редактировать">✏️</button>
                        <button class="btn btn-sm btn-white border ${isActive ? 'text-warning' : 'text-success'}" 
                                onclick="toggleUserStatus('${u.id}', ${isActive})" 
                                title="${isActive ? 'Заблокировать' : 'Разблокировать'}">
                            ${isActive ? '🚫' : '✅'}
                        </button>
                    </div>
                </td>
            </tr>`;
    });
    container.innerHTML = html + '</tbody></table>';
}

window.filterAdminUsers = function() {
    loadAdminUsers();
};

function getRoleBadge(roleName) {
    if (!roleName) return '';
    let colorClass = 'bg-secondary'; // По умолчанию серый

    switch (roleName.trim()) {
        case 'Администратор':
            colorClass = 'bg-danger'; // Красный
            break;
        case 'Руководитель':
            colorClass = 'bg-dark'; // Черный/Темный
            break;
        case 'Менеджер':
            colorClass = 'bg-success'; // Зеленый
            break;
        case 'Технический специалист 1С':
            colorClass = 'bg-warning text-dark'; // Желтый
            break;
        case 'Технический специалист':
            colorClass = 'bg-primary'; // Синий
            break;
    }
    return `<span class="badge ${colorClass} rounded-pill" style="font-weight: 500;">${roleName}</span>`;
}



// 1. ГЕНЕРАТОР ПАРОЛЯ
window.generatePassword = function() {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let retVal = "";
    for (let i = 0; i < 8; ++i) {
        retVal += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    document.getElementById('user-password').value = retVal;
};

// 2. ОТКРЫТИЕ МОДАЛКИ (вызывается твоей кнопкой + Добавить или при редактировании)
window.openAddUserModal = function() { openUserModal(); }; // Совместимость с твоим HTML

window.openUserModal = async function(userId = null) {
    const modalElement = document.getElementById('userModal');
    const modal = new bootstrap.Modal(modalElement);
    
    // Полный сброс формы
    document.getElementById('user-form').reset();
    document.getElementById('edit-user-id').value = userId || '';
    
    // Скрываем/показываем кнопку копирования (нужна ли она при создании — на твое усмотрение, 
    // но логичнее показывать, когда пароль уже сгенерирован)
    const copyBtn = document.getElementById('copy-auth-btn');
    if (copyBtn) copyBtn.style.display = userId ? 'block' : 'none';

    // Загружаем роли (используем твой существующий код)
    const { data: allRoles } = await supabase.from('roles').select('*').order('role_name');
    const rolesContainer = document.getElementById('roles-checkboxes');
    let userRolesIds = [];
    
    if (userId) {
        const { data: user } = await supabase
            .from('users')
            .select('*, user_roles(role_id)')
            .eq('id', userId)
            .single();
        
        if (user) {
            document.getElementById('userModalTitle').innerText = 'Редактирование: ' + user.full_name;
            document.getElementById('user-fullname-input').value = user.full_name || '';
            document.getElementById('user-email').value = user.email || '';
            document.getElementById('user-password').value = user.password || '';
            
            // Вызываем загрузку отделов и устанавливаем значение
            await loadDepartmentsToSelect(user.dept);
            userRolesIds = user.user_roles.map(r => r.role_id);
            if (copyBtn) copyBtn.style.display = 'block';
        }
    } else {
        document.getElementById('userModalTitle').innerText = 'Новый сотрудник';
        await loadDepartmentsToSelect();
    }

    // Отрисовка чекбоксов ролей
    rolesContainer.innerHTML = allRoles.map(role => `
        <div class="form-check small">
            <input class="form-check-input role-chkbx" type="checkbox" value="${role.id}" 
                id="role-${role.id}" ${userRolesIds.includes(role.id) ? 'checked' : ''}>
            <label class="form-check-label" for="role-${role.id}">${role.role_name}</label>
        </div>
    `).join('');

    modal.show();
};

// Функция обновления ролей (решает проблему с ошибкой "is not defined")
async function updateUserRoles(userId) {
    // Собираем все выбранные чекбоксы ролей
    const selectedRoles = Array.from(document.querySelectorAll('.role-chkbx:checked'))
        .map(cb => ({
            user_id: userId,
            role_id: parseInt(cb.value)
        }));

    // 1. Удаляем текущие роли пользователя в БД
    await supabase.from('user_roles').delete().eq('user_id', userId);

    // 2. Если есть новые выбранные роли — записываем их
    if (selectedRoles.length > 0) {
        const { error } = await supabase.from('user_roles').insert(selectedRoles);
        if (error) throw error;
    }
}

// 3. СОХРАНЕНИЕ
window.saveUser = async function() {
    const btn = document.getElementById('save-user-btn');
    const userId = document.getElementById('edit-user-id').value;
    
    // 1. Получаем ФИО
    const rawFullName = document.getElementById('user-fullname-input').value.trim();
    const parts = rawFullName.split(' ').filter(word => word.length > 0);
    
    if (parts.length < 2) {
        return alert("Введите как минимум Фамилию и Имя через пробел");
    }

    const shortName = `${parts[0]} ${parts[1]}`;

    // 2. РАБОТА С ОТДЕЛОМ
   const deptSelect = document.getElementById('user-dept-select');
const selectedOption = deptSelect.options[deptSelect.selectedIndex];

// Берем чистое полное название из data-атрибута
const fullDeptName = selectedOption ? selectedOption.dataset.full : "";


if (fullDeptName.includes(' (')) {
    fullDeptName = fullDeptName.split(' (')[0].trim();
}

const userData = {
    full_name: rawFullName,
    display_name: shortName,
    email: document.getElementById('user-email').value,
    password: document.getElementById('user-password').value,
    dept: deptSelect.value,        // Уйдет сокращенное (ОПС)
    dept_full: fullDeptName,       // Уйдет ПОЛНОЕ (Отдел продаж сервисов ЭДО)
    is_active: true
};

    if (!userData.email || !userData.dept) {
        return alert("Заполните Email и выберите Отдел");
    }

    btn.disabled = true;
    try {
        let savedId = userId;
        if (userId) {
            await supabase.from('users').update(userData).eq('id', userId);
        } else {
            const { data: newUser, error } = await supabase.from('users').insert([userData]).select().single();
            if (error) throw error;
            savedId = newUser.id;
        }

        // Обновление ролей (та самая функция, которую мы добавили)
        await updateUserRoles(savedId);

        bootstrap.Modal.getInstance(document.getElementById('userModal')).hide();
        if (window.loadAdminUsers) window.loadAdminUsers();
    } catch (err) {
        console.error(err);
        alert("Ошибка: " + err.message);
    } finally {
        btn.disabled = false;
    }
};

async function loadDepartmentsToSelect(selectedDept = null) {
    const deptSelect = document.getElementById('user-dept-select');
    if (!deptSelect) return;

    try {
        const { data: depts, error } = await supabase
            .from('departments')
            .select('dept, dept_full')
            .order('dept_full');

        if (error) throw error;

        if (depts) {
            deptSelect.innerHTML = '<option value="">Выберите отдел...</option>' + 
                depts.map(d => `
                    <option value="${d.dept}" 
                            data-full="${d.dept_full}" 
                            ${selectedDept === d.dept ? 'selected' : ''}>
                        ${d.dept} (${d.dept_full})
                    </option>
                `).join('');
        }
    } catch (err) {
        console.error("Ошибка загрузки отделов:", err);
        deptSelect.innerHTML = '<option value="">Ошибка БД</option>';
    }
}

async function updateUserRoles(userId) {
    // 1. Собираем все выбранные чекбоксы из модалки
    const selectedRoles = Array.from(document.querySelectorAll('.role-chkbx:checked'))
        .map(cb => ({
            user_id: userId,
            role_id: parseInt(cb.value)
        }));

    // 2. Сначала удаляем все старые привязки этого юзера, чтобы не было дублей
    const { error: deleteError } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId);

    if (deleteError) {
        console.error("Ошибка при удалении старых ролей:", deleteError);
        throw deleteError;
    }

    // 3. Если админ выбрал роли, записываем их в таблицу
    if (selectedRoles.length > 0) {
        const { error: insertError } = await supabase
            .from('user_roles')
            .insert(selectedRoles);

        if (insertError) {
            console.error("Ошибка при записи новых ролей:", insertError);
            throw insertError;
        }
    }
}

// 1. БЛОКИРОВКА / РАЗБЛОКИРОВКА
window.toggleUserStatus = async function(userId, currentStatus) {
    const action = currentStatus ? "заблокировать" : "разблокировать";
    if (!confirm(`Вы уверены, что хотите ${action} доступ для этого сотрудника?`)) return;

    const { error } = await supabase
        .from('users')
        .update({ is_active: !currentStatus })
        .eq('id', userId);

    if (error) {
        alert("Ошибка при смене статуса: " + error.message);
    } else {
        loadAdminUsers(); // Обновляем список
    }
};

// 2. УДАЛЕНИЕ
window.deleteUser = async function(userId) {
    if (!confirm("⚠️ ВНИМАНИЕ! Вы удаляете сотрудника безвозвратно. Все его настройки будут стерты. Продолжить?")) return;

    // Сначала удаляем роли и настройки (так как у тебя UUID связи)
    await supabase.from('user_roles').delete().eq('user_id', userId);
    await supabase.from('specialist_settings').delete().eq('user_id', userId);
    await supabase.from('specialist_skills').delete().eq('user_id', userId);

    const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', userId);

    if (error) {
        alert("Ошибка при удалении: " + error.message);
    } else {
        loadAdminUsers(); // Обновляем список
    }
};

// ОТКРЫТИЕ МОДАЛКИ РЕДАКТИРОВАНИЯ
window.openEditUserModal = async function(userId) {
    const modal = new bootstrap.Modal(document.getElementById('editUserModal'));
    const passInput = document.getElementById('edit-user-password');
    const statusLabel = document.getElementById('edit-pass-status');
    
    // 1. Сброс состояния
    statusLabel.classList.add('d-none');
    passInput.type = "password";
    
    // 2. Получаем данные
    const { data: user, error } = await supabase
        .from('users')
        .select('*, user_roles(role_id)')
        .eq('id', userId)
        .single();

    if (error || !user) return alert("Ошибка загрузки данных");

    // 3. Заполняем поля
    document.getElementById('edit-user-id-hidden').value = user.id;
    document.getElementById('edit-user-fullname').value = user.full_name;
    document.getElementById('edit-user-email').value = user.email;
    passInput.value = user.password || '';
    
    // Загружаем отделы специально для этой модалки
    await loadDepartmentsToEdit(user.dept);

    // 4. Загружаем роли
    const { data: allRoles } = await supabase.from('roles').select('*').order('role_name');
    const userRolesIds = user.user_roles?.map(r => r.role_id) || [];
    
    document.getElementById('edit-roles-checkboxes').innerHTML = allRoles.map(role => `
        <div class="form-check small">
            <input class="form-check-input edit-role-chkbx" type="checkbox" value="${role.id}" 
                id="edit-role-${role.id}" ${userRolesIds.includes(role.id) ? 'checked' : ''}>
            <label class="form-check-label" for="edit-role-${role.id}">${role.role_name}</label>
        </div>
    `).join('');

    modal.show();
};

// ГЕНЕРАЦИЯ В МОДАЛКЕ РЕДАКТИРОВАНИЯ
window.generateEditPassword = function() {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let newPass = "";
    for (let i = 0; i < 8; ++i) newPass += charset.charAt(Math.floor(Math.random() * charset.length));
    
    const input = document.getElementById('edit-user-password');
    input.value = newPass;
    input.type = "text"; // Показываем новый пароль
    document.getElementById('edit-pass-status').classList.remove('d-none');
};

// КОПИРОВАНИЕ В МОДАЛКЕ РЕДАКТИРОВАНИЯ
window.copyEditAuthData = function() {
    const email = document.getElementById('edit-user-email').value;
    const pass = document.getElementById('edit-user-password').value;
    const text = `Логин: ${email}\nПароль: ${pass}`;
    
    navigator.clipboard.writeText(text).then(() => alert("Данные скопированы!"));
};

// СОХРАНЕНИЕ ОТРЕДАКТИРОВАННОГО
window.saveEditedUser = async function() {
    const userId = document.getElementById('edit-user-id-hidden').value;
    const rawFullName = document.getElementById('edit-user-fullname').value.trim();
    const parts = rawFullName.split(' ').filter(word => word.length > 0);
    
    const deptSelect = document.getElementById('edit-user-dept-select');
    const selectedOption = deptSelect.options[deptSelect.selectedIndex];
    
    const userData = {
        full_name: rawFullName,
        display_name: parts.length >= 2 ? `${parts[0]} ${parts[1]}` : rawFullName,
        email: document.getElementById('edit-user-email').value,
        password: document.getElementById('edit-user-password').value,
        dept: deptSelect.value,
        dept_full: selectedOption ? selectedOption.dataset.full : ""
    };

    try {
        await supabase.from('users').update(userData).eq('id', userId);
        
        // Обновляем роли (используем чекбоксы именно из модалки редактирования)
        const selectedRoles = Array.from(document.querySelectorAll('.edit-role-chkbx:checked'))
            .map(cb => ({ user_id: userId, role_id: parseInt(cb.value) }));
        
        await supabase.from('user_roles').delete().eq('user_id', userId);
        if (selectedRoles.length > 0) await supabase.from('user_roles').insert(selectedRoles);

        bootstrap.Modal.getInstance(document.getElementById('editUserModal')).hide();
        loadAdminUsers();
    } catch (err) {
        alert("Ошибка сохранения: " + err.message);
    }
};

// ВСПОМОГАТЕЛЬНАЯ: Загрузка отделов для модалки редактирования
async function loadDepartmentsToEdit(selectedDept = null) {
    const deptSelect = document.getElementById('edit-user-dept-select');
    const { data: depts } = await supabase.from('departments').select('*').order('dept_full');
    
    if (depts) {
        deptSelect.innerHTML = depts.map(d => `
            <option value="${d.dept}" data-full="${d.dept_full}" ${selectedDept === d.dept ? 'selected' : ''}>
                ${d.dept} (${d.dept_full})
            </option>
        `).join('');
    }
}

// 1. Открытие маленького окошка
window.openPasswordChangeMiniModal = function() {
    const miniModal = new bootstrap.Modal(document.getElementById('changePasswordModal'));
    document.getElementById('new-edit-password').value = ''; // Очищаем при открытии
    miniModal.show();
};

// 2. Генерация внутри маленького окошка
window.generatePasswordInMiniModal = function() {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let retVal = "";
    for (let i = 0; i < 8; ++i) {
        retVal += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    document.getElementById('new-edit-password').value = retVal;
};

// 3. Подстановка пароля в основную форму редактирования
window.confirmNewPassword = function() {
    const newPass = document.getElementById('new-edit-password').value;
    if (!newPass) return alert("Сгенерируйте пароль!");

    const mainPassInput = document.getElementById('edit-user-password');
    mainPassInput.value = newPass;
    mainPassInput.type = 'text'; // Делаем его видимым в основной модалке
    
    // Показываем надпись "Пароль изменен" если она есть
    const status = document.getElementById('edit-pass-status');
    if (status) status.classList.remove('d-none');

    // Закрываем маленькое окошко
    bootstrap.Modal.getInstance(document.getElementById('changePasswordModal')).hide();
};
