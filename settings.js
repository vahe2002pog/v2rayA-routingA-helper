const storage = chrome.storage.local

function getServer(){ return new Promise(res=>storage.get(['serverUrl','token','username'], r=>res(r))) }
function setServer(obj){ return new Promise(res=>storage.set(obj, ()=>res())) }

async function callApi(server, token, path, method='GET', body=null){
  const headers = {'Content-Type':'application/json'}
  if(token) headers['Authorization'] = 'Bearer ' + token
  const opts = {method, headers}
  if(body) opts.body = JSON.stringify(body)
  const r = await fetch(server.replace(/\/$/,'') + path, opts)
  if(!r.ok){ const txt = await r.text(); throw new Error(r.status + ' ' + txt) }
  return await r.json()
}

async function login(){
  const server = document.getElementById('serverUrl').value || 'http://192.168.1.1:2017'
  const username = document.getElementById('username').value
  const password = document.getElementById('password').value
  const status = document.getElementById('status')
  status.textContent = ''
  try{
    const resp = await callApi(server, null, '/api/login', 'POST', {username, password})
    if(!resp || resp.code !== 'SUCCESS'){
      const msg = resp && resp.message ? resp.message : 'unknown'
      status.textContent = t('login_failed') + msg
      return
    }
    const token = resp.data && resp.data.token ? resp.data.token : null
    if(!token){ status.textContent = t('login_failed') + 'no token in response'; return }
    await setServer({serverUrl: server, token: token, username})
    status.textContent = t('login_ok')
    setTimeout(()=>{ location.href = 'popup.html' }, 400)
  }catch(e){ status.textContent = t('login_failed') + e.message }
}

window.onload = async ()=>{
  const s = await getServer()
  // try to restore saved server and auth, prefer explicit saved server over draft
  storage.get(['settings_draft_serverUrl','settings_draft_username','settings_draft_password'], r=>{
    const draftServer = r['settings_draft_serverUrl']
    const draftUser = r['settings_draft_username']
    const draftPass = r['settings_draft_password']
    if(s.serverUrl) document.getElementById('serverUrl').value = s.serverUrl
    else if(draftServer) document.getElementById('serverUrl').value = draftServer
    if(s.username) document.getElementById('username').value = s.username
    else if(draftUser) document.getElementById('username').value = draftUser
    if(draftPass) document.getElementById('password').value = draftPass
  })
  // toggle UI if already logged in
  if(s && s.token){
    document.getElementById('authInputs').style.display = 'none'
    document.getElementById('loggedIn').style.display = 'block'
    document.getElementById('loggedName').textContent = s.username || ''
  } else {
    document.getElementById('authInputs').style.display = 'block'
    document.getElementById('loggedIn').style.display = 'none'
  }
  document.getElementById('btnLogin').onclick = login
  document.getElementById('btnLogout').onclick = async ()=>{
    await setServer({token: null, username: null})
    document.getElementById('authInputs').style.display = 'block'
    document.getElementById('loggedIn').style.display = 'none'
    document.getElementById('status').textContent = t('logged_out')
  }
  document.getElementById('btnBack').onclick = ()=>{ location.href = 'popup.html' }

  // --- Browser proxy settings ---
  function sendMsg(msg){ return new Promise(res=>{ try{ chrome.runtime.sendMessage(msg, r=>res(r)) }catch(e){ res(null) } }) }
  const proxyEnabled = document.getElementById('proxyEnabled')
  const proxyHost = document.getElementById('proxyHost')
  const proxyPort = document.getElementById('proxyPort')
  const proxyScheme = document.getElementById('proxyScheme')
  const proxyDomains = document.getElementById('proxyDomains')
  const proxyStatus = document.getElementById('proxyStatus')
  const btnSaveProxy = document.getElementById('btnSaveProxy')
  const btnFetchPorts = document.getElementById('btnFetchPorts')

  async function loadProxy(){
    const r = await sendMsg({type:'PROXY_GET_CONFIG'})
    if(!r || !r.ok) return
    const cfg = r.cfg || {}
    if(proxyEnabled) proxyEnabled.checked = !!cfg.proxy_enabled
    if(proxyHost) proxyHost.value = cfg.proxy_host || '192.168.1.1'
    if(proxyPort) proxyPort.value = cfg.proxy_port || 20171
    if(proxyScheme) proxyScheme.value = cfg.proxy_scheme || 'http'
    if(proxyDomains) proxyDomains.value = (cfg.proxy_domains || []).join('\n')
  }
  loadProxy()

  if(btnSaveProxy) btnSaveProxy.onclick = async ()=>{
    if(proxyStatus) proxyStatus.textContent = ''
    const domains = (proxyDomains.value || '')
      .split(/\r?\n/).map(s=>s.trim().toLowerCase()).filter(Boolean)
    const patch = {
      proxy_enabled: !!proxyEnabled.checked,
      proxy_host: (proxyHost.value || '192.168.1.1').trim(),
      proxy_port: parseInt(proxyPort.value, 10) || 20171,
      proxy_scheme: proxyScheme ? (proxyScheme.value || 'http') : 'http',
      proxy_domains: domains
    }
    const r = await sendMsg({type:'PROXY_SET_CONFIG', patch})
    if(proxyStatus) proxyStatus.textContent = (r && r.ok) ? t('proxy_saved') : ((r && r.error) || t('save_failed'))
  }

  if(btnFetchPorts) btnFetchPorts.onclick = async ()=>{
    if(proxyStatus) proxyStatus.textContent = '...'
    const r = await sendMsg({type:'PROXY_FETCH_PORTS'})
    if(!r || !r.ok){ if(proxyStatus) proxyStatus.textContent = (t('proxy_fetch_failed') || 'Fetch failed: ') + ((r && r.error) || 'unknown'); return }
    const data = r.data || {}
    const port = data.http || 0
    if(!port){ if(proxyStatus) proxyStatus.textContent = t('proxy_no_ports') || 'No inbound ports available'; return }
    if(proxyScheme) proxyScheme.value = 'http'
    if(proxyPort) proxyPort.value = port
    if(proxyStatus) proxyStatus.textContent = (t('proxy_fetch_ok') || 'Port: ') + 'HTTP ' + port
  }
  // Compact rules button
  const btnCompact = document.getElementById('btnCompactRules')
  const compactStatus = document.getElementById('compactStatus')
  if(btnCompact) btnCompact.onclick = async ()=>{
    if(compactStatus) compactStatus.textContent = ''
    try{
      const sv = await getServer()
      const server = sv.serverUrl || 'http://192.168.1.1:2017'
      const token = sv.token
      const resp = await callApi(server, token, '/api/routingA', 'GET')
      if(!resp || resp.code !== 'SUCCESS' || !resp.data){
        const msg = resp && resp.message ? resp.message : 'no data'
        if(compactStatus) compactStatus.textContent = t('compact_failed') + msg
        return
      }
      const original = resp.data.routingA || ''
      const result = window.compactRouting(original)
      if(!result.changed){
        if(compactStatus) compactStatus.textContent = t('compact_no_changes')
        return
      }
      const before = result.stats.originalRules
      const after = result.stats.compactedLines
      const perAction = Object.keys(result.stats.perAction)
        .map(a => `  ${a}: ${result.stats.perAction[a]}`).join('\n')
      const tmpl = t('compact_confirm')
      const msg = tmpl
        .replace('{before}', String(before))
        .replace('{after}', String(after))
        .replace('{groups}', perAction)
      if(!confirm(msg)) return
      const r = await new Promise(res=>{
        chrome.runtime.sendMessage(
          {type:'SAVE_ROUTING', newText: result.text, serverUrl: server, token},
          response=>{
            if(chrome.runtime.lastError){ res({ok:false, error: chrome.runtime.lastError.message}); return }
            res(response)
          }
        )
      })
      if(r && r.ok){
        if(compactStatus) compactStatus.textContent = t('compact_done')
      } else {
        if(compactStatus) compactStatus.textContent = t('compact_failed') + ((r && r.error) || 'unknown')
      }
    }catch(e){
      if(compactStatus) compactStatus.textContent = t('compact_failed') + (e.message || e)
    }
  }

  // Language picker
  const langBtns = document.querySelectorAll('.lang-btn')
  function setActiveLang(lang){
    langBtns.forEach(b=>{
      b.classList.toggle('active', b.dataset.lang === lang)
    })
    applyLang(lang)
  }
  storage.get(['lang'], r=>{
    setActiveLang((r && r.lang) || 'en')
  })
  langBtns.forEach(b=>{
    b.addEventListener('click', ()=>{
      const lang = b.dataset.lang
      storage.set({lang})
      setActiveLang(lang)
    })
  })
  // autosave settings inputs to storage so they are not lost on popup close
  const serverEl = document.getElementById('serverUrl')
  const userEl = document.getElementById('username')
  const passEl = document.getElementById('password')
  if(serverEl) serverEl.addEventListener('input', ()=>{ const o={settings_draft_serverUrl: serverEl.value}; storage.set(o) })
  if(userEl) userEl.addEventListener('input', ()=>{ const o={settings_draft_username: userEl.value}; storage.set(o) })
  if(passEl) passEl.addEventListener('input', ()=>{ const o={settings_draft_password: passEl.value}; storage.set(o) })
  // clear drafts on successful login
  const originalLogin = document.getElementById('btnLogin').onclick
  document.getElementById('btnLogin').onclick = async ()=>{
    await originalLogin()
    // if login succeeded, clear drafts
    const status = document.getElementById('status')
    if(status && status.textContent && (status.textContent === t('login_ok'))){
      storage.remove(['settings_draft_serverUrl','settings_draft_username','settings_draft_password'])
    }
  }
}
