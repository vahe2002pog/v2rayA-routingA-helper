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
      status.textContent = 'Login failed: ' + msg
      return
    }
    const token = resp.data && resp.data.token ? resp.data.token : null
    if(!token){ status.textContent = 'Login failed: no token in response'; return }
    await setServer({serverUrl: server, token: token, username})
    status.textContent = 'Login OK'
    setTimeout(()=>{ location.href = 'popup.html' }, 400)
  }catch(e){ status.textContent = 'Login failed: '+e.message }
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
    document.getElementById('status').textContent = 'Logged out'
  }
  document.getElementById('btnBack').onclick = ()=>{ location.href = 'popup.html' }
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
    if(status && status.textContent && status.textContent.toLowerCase().includes('login ok')){
      storage.remove(['settings_draft_serverUrl','settings_draft_username','settings_draft_password'])
    }
  }
}
