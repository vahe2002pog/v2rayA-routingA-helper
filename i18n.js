const i18n = {
  en: {
    // settings
    settings_title: 'Settings & Auth',
    server_url: 'Server URL',
    username_password: 'Username / Password',
    user_placeholder: 'User',
    pass_placeholder: 'Pass',
    login: 'Login',
    logged_as: 'Logged as',
    logout: 'Logout',
    language: 'Language',
    back: 'Back',
    login_ok: 'Login OK',
    logged_out: 'Logged out',
    login_failed: 'Login failed: ',
    // popup
    proxy_loading: 'Loading...',
    proxy_working: 'Working',
    proxy_ready: 'Ready',
    proxy_stop: 'Stop',
    proxy_start: 'Start',
    tab_current: 'Current',
    tab_global: 'Global',
    placeholder_current: 'site-related rules will appear here',
    placeholder_global: 'full routing config will appear here',
    add_current_tab: 'Add current tab',
    save: 'Save',
    saving: 'Saving...',
    saved: 'Saved',
    updated: 'Updated',
    current_host: 'Current host:',
    show_domains_title: 'Show contacted domains',
    reload_title: 'Reload',
    open_panel_title: 'Open panel',
    settings_title_btn: 'Settings',
    // rules
    no_host: 'No host',
    no_host_detected: 'No host detected',
    no_site_rules: 'No site-specific rules found',
    cannot_get_rules: 'Cannot get rules: ',
    update_failed: 'Update failed: ',
    save_failed: 'Save failed: ',
    validation_failed: 'Validation failed: ',
    rule_already: 'Rule already in textarea',
    added_to_textarea: 'Added to textarea (click Save to apply)',
    remove_failed: 'Remove failed: ',
    restored_local_draft: 'Restored local draft',
    restored_global_draft: 'Restored local global draft',
    cannot_fetch_config: 'Cannot fetch full config: ',
    validation_prefix: 'Validation: ',
    no_domains: 'No domains recorded for this tab',
    cannot_read_domains: 'Cannot read domains: ',
    refreshing_domains: 'Refreshing domains...',
    refresh_failed: 'Refresh failed: ',
    contacted_domains: 'Contacted domains',
    no_domains_list: '(no domains)',
    copy_domain: 'Copy domain to clipboard',
    close: 'Close',
    // validation
    val_unbalanced: 'unbalanced parentheses',
    val_expected_arrow: "expected ')->' after domain/ip list",
    val_missing_action: "missing action after '->'",
    val_control_chars: 'contains control characters',
    // browser proxy
    proxy_site_add: 'Proxy this site',
    proxy_site_remove: 'Unproxy this site',
    proxy_site_added: 'Added to proxy list',
    proxy_site_removed: 'Removed from proxy list',
    proxy_browser_section: 'Browser proxy',
    proxy_browser_enable: 'Enable browser proxy',
    proxy_browser_host: 'Proxy host',
    proxy_browser_port: 'Proxy port',
    proxy_browser_scheme: 'Protocol',
    proxy_browser_mode: 'Mode',
    proxy_mode_include: 'Only listed domains',
    proxy_mode_all: 'All traffic',
    proxy_browser_domains: 'Proxied domains (one per line)',
    proxy_fetch_ports: 'Fetch port from v2rayA',
    proxy_fetch_ok: 'Port fetched: ',
    proxy_fetch_failed: 'Fetch failed: ',
    proxy_save: 'Save proxy settings',
    proxy_saved: 'Proxy settings saved',
    proxy_on: 'Proxy: ON',
    proxy_off: 'Proxy: OFF',
    proxy_this_site: 'Proxy this site',
    proxy_hint_no_host: 'No host to toggle',
    proxy_hint_disabled: 'Browser proxy is disabled in settings',
    proxy_via: 'via',
    proxy_no_ports: 'No inbound ports available',
    // compact rules
    compact_rules: 'Compact rules',
    compact_confirm: 'Compact routing rules?\n\nBefore: {before} simple domain rule(s)\nAfter:  {after} compacted line(s)\n\nDomains per action:\n{groups}\n\nApply and restart core?',
    compact_done: 'Rules compacted and saved',
    compact_failed: 'Compact failed: ',
    compact_no_changes: 'Nothing to compact',
  },
  ru: {
    // settings
    settings_title: 'Настройки',
    server_url: 'URL сервера',
    username_password: 'Логин / Пароль',
    user_placeholder: 'Логин',
    pass_placeholder: 'Пароль',
    login: 'Войти',
    logged_as: 'Вы вошли как',
    logout: 'Выйти',
    language: 'Язык',
    back: 'Назад',
    login_ok: 'Вход выполнен',
    logged_out: 'Вы вышли',
    login_failed: 'Ошибка входа: ',
    // popup
    proxy_loading: 'Загрузка...',
    proxy_working: 'Работает',
    proxy_ready: 'Готов',
    proxy_stop: 'Стоп',
    proxy_start: 'Старт',
    tab_current: 'Текущий',
    tab_global: 'Глобальный',
    placeholder_current: 'правила для сайта появятся здесь',
    placeholder_global: 'полный конфиг маршрутизации появится здесь',
    add_current_tab: 'Добавить текущий',
    save: 'Сохранить',
    saving: 'Сохранение...',
    saved: 'Сохранено',
    updated: 'Обновлено',
    current_host: 'Текущий хост:',
    show_domains_title: 'Показать домены',
    reload_title: 'Обновить',
    open_panel_title: 'Открыть панель',
    settings_title_btn: 'Настройки',
    // rules
    no_host: 'Нет хоста',
    no_host_detected: 'Хост не определён',
    no_site_rules: 'Правила для сайта не найдены',
    cannot_get_rules: 'Не удалось получить правила: ',
    update_failed: 'Ошибка обновления: ',
    save_failed: 'Ошибка сохранения: ',
    validation_failed: 'Ошибка валидации: ',
    rule_already: 'Правило уже в текстовом поле',
    added_to_textarea: 'Добавлено (нажмите Сохранить для применения)',
    remove_failed: 'Ошибка удаления: ',
    restored_local_draft: 'Восстановлен локальный черновик',
    restored_global_draft: 'Восстановлен глобальный черновик',
    cannot_fetch_config: 'Не удалось загрузить конфиг: ',
    validation_prefix: 'Валидация: ',
    no_domains: 'Нет доменов для этой вкладки',
    cannot_read_domains: 'Не удалось прочитать домены: ',
    refreshing_domains: 'Обновление доменов...',
    refresh_failed: 'Ошибка обновления: ',
    contacted_domains: 'Запрошенные домены',
    no_domains_list: '(нет доменов)',
    copy_domain: 'Копировать домен',
    close: 'Закрыть',
    // validation
    val_unbalanced: 'несбалансированные скобки',
    val_expected_arrow: "ожидается ')->' после списка domain/ip",
    val_missing_action: "отсутствует действие после '->'",
    val_control_chars: 'содержит управляющие символы',
    // browser proxy
    proxy_site_add: 'Проксировать сайт',
    proxy_site_remove: 'Убрать из прокси',
    proxy_site_added: 'Добавлено в список прокси',
    proxy_site_removed: 'Удалено из списка прокси',
    proxy_browser_section: 'Прокси браузера',
    proxy_browser_enable: 'Включить прокси браузера',
    proxy_browser_host: 'Хост прокси',
    proxy_browser_port: 'Порт прокси',
    proxy_browser_scheme: 'Протокол',
    proxy_browser_mode: 'Режим',
    proxy_mode_include: 'Только указанные домены',
    proxy_mode_all: 'Весь трафик',
    proxy_browser_domains: 'Домены через прокси (по одному на строке)',
    proxy_fetch_ports: 'Получить порт из v2rayA',
    proxy_fetch_ok: 'Получен порт: ',
    proxy_fetch_failed: 'Ошибка получения: ',
    proxy_save: 'Сохранить настройки прокси',
    proxy_saved: 'Настройки прокси сохранены',
    proxy_on: 'Прокси: ВКЛ',
    proxy_off: 'Прокси: ВЫКЛ',
    proxy_this_site: 'Проксировать сайт',
    proxy_hint_no_host: 'Нет хоста для переключения',
    proxy_hint_disabled: 'Прокси браузера отключён в настройках',
    proxy_via: 'через',
    proxy_no_ports: 'Нет доступных портов',
    // compact rules
    compact_rules: 'Сжать правила',
    compact_confirm: 'Сжать правила маршрутизации?\n\nДо:    {before} простых domain-правил\nПосле: {after} сжатых строк\n\nДоменов по действию:\n{groups}\n\nПрименить и перезапустить ядро?',
    compact_done: 'Правила сжаты и сохранены',
    compact_failed: 'Ошибка сжатия: ',
    compact_no_changes: 'Сжимать нечего',
  }
}

let currentLang = 'en'

function t(key){
  const dict = i18n[currentLang] || i18n.en
  return dict[key] || (i18n.en[key] || key)
}

function applyLang(lang){
  currentLang = lang
  document.querySelectorAll('[data-i18n]').forEach(el=>{
    const key = el.getAttribute('data-i18n')
    const val = t(key)
    if(val) el.textContent = val
  })
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el=>{
    const key = el.getAttribute('data-i18n-placeholder')
    const val = t(key)
    if(val) el.placeholder = val
  })
  document.querySelectorAll('[data-i18n-title]').forEach(el=>{
    const key = el.getAttribute('data-i18n-title')
    const val = t(key)
    if(val) el.title = val
  })
}

function loadLang(cb){
  chrome.storage.local.get(['lang'], r=>{
    const lang = (r && r.lang) || 'en'
    applyLang(lang)
    if(cb) cb(lang)
  })
}
