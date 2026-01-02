async function qs(id){return document.getElementById(id)}

const storage = chrome.storage.local

async function getServer(){
  return new Promise(res=>storage.get(['serverUrl','token','username'], r=>res(r)))
}

function setServer(obj){ return new Promise(res=>storage.set(obj, ()=>res())) }

async function callApi(server, token, path, method='GET', body=null){
  const headers = {'Content-Type':'application/json'}
  if(token) headers['Authorization'] = 'Bearer ' + token
  const opts = {method, headers}
  if(body) opts.body = JSON.stringify(body)
  const r = await fetch(server.replace(/\/$/,'') + path, opts)
  if(!r.ok){
    const txt = await r.text()
    throw new Error(r.status + ' ' + txt)
  }
  return await r.json()
}

async function login(){
  const server = (await getServer()).serverUrl || 'http://192.168.1.1:2017'
  const username = document.getElementById('username').value
  const password = document.getElementById('password').value
  try{
    const resp = await callApi(server, null, '/api/login', 'POST', {username, password})
    await setServer({serverUrl: server, token: resp.token, username})
    alert('Login ok')
    await refreshRules()
  }catch(e){ alert('Login failed: '+e.message) }
}

async function refreshRules(){
  const s = await getServer()
  const server = s.serverUrl || 'http://192.168.1.1:2017'
  const token = s.token
  try{
    const resp = await callApi(server, token, '/api/routingA', 'GET')
    const routing = resp.routingA
    renderRules(routing)
  }catch(e){ alert('Cannot get rules: '+e.message) }
}

function renderRules(text){
  const el = document.getElementById('rules')
  el.innerHTML = ''
  const lines = text.split('\n')
  lines.forEach((ln,i)=>{
    const d = document.createElement('div')
    d.className = 'rule'
    const left = document.createElement('div')
    left.textContent = ln
    const btn = document.createElement('button')
    btn.textContent = '✖'
    btn.title = 'Delete this line'
    btn.onclick = async ()=>{
      const s = await getServer(); await putRoutingA(removeLineAt(text, i), s)
    }
    d.appendChild(left); d.appendChild(btn)
    el.appendChild(d)
  })
}

function removeLineAt(text, idx){
  const arr = text.split('\n')
  arr.splice(idx,1)
  return arr.join('\n')
}

async function putRoutingA(newText, s){
  const server = s.serverUrl || 'http://192.168.1.1:2017'
  const token = s.token
  try{
    const resp = await callApi(server, token, '/api/routingA', 'PUT', {routingA: newText})
    if(!resp || resp.code !== 'SUCCESS'){
      const msg = resp && resp.message ? resp.message : 'unknown error'
      alert('Update failed: ' + msg)
      return false
    }
    // try to ask server to reload v2ray
    try{ await callApi(server, token, '/api/v2ray', 'POST', {}) }catch(e){}
    alert('Updated')
    await refreshRules()
    return true
  }catch(e){ alert('Update failed: '+e.message) }
}

async function addDomainToRouting(host){
  const s = await getServer()
  const server = s.serverUrl || 'http://192.168.1.1:2017'
  const token = s.token
  try{
    const resp = await callApi(server, token, '/api/routingA', 'GET')
    const text = resp.routingA
    const rule = `domain(${host})->proxy`
    if(text.includes(rule)) { alert('Rule already exists'); return }
    // insert after first line (after default)
    const lines = text.split('\n')
    if(lines.length>0) lines.splice(1,0,rule)
    else lines.push(rule)
    const newText = lines.join('\n')
    await putRoutingA(newText, s)
  }catch(e){ alert('Add failed: '+e.message) }
}

async function removeDomainFromRouting(host){
  const s = await getServer()
  try{
    const resp = await callApi(s.serverUrl||'http://192.168.1.1:2017', s.token, '/api/routingA', 'GET')
    const text = resp.routingA
    const rule = `domain(${host})->proxy`
    const lines = text.split('\n').filter(l=>l.trim() !== rule)
    await putRoutingA(lines.join('\n'), s)
  }catch(e){ alert('Remove failed: '+e.message) }
}

async function getCurrentTabHost(){
  return new Promise(res=>{
    chrome.tabs.query({active:true,currentWindow:true}, tabs=>{
      if(!tabs || tabs.length===0) return res(null)
      try{
        const url = new URL(tabs[0].url)
        res(url.hostname)
      }catch(e){ res(null) }
    })
  })
}

// init
window.onload = async ()=>{
  const s = await getServer()
  if(s.serverUrl) document.getElementById('serverUrl').value = s.serverUrl
  if(s.username) document.getElementById('username').value = s.username
  document.getElementById('btnLogin').onclick = async ()=>{
    const server = document.getElementById('serverUrl').value || 'http://192.168.1.1:2017'
    await setServer({serverUrl:server})
    await login()
  }
  document.getElementById('btnRefresh').onclick = refreshRules
  document.getElementById('addDomain').onclick = async ()=>{
    const host = document.getElementById('domainInput').value || await getCurrentTabHost()
    if(!host){ alert('No host'); return }
    await addDomainToRouting(host)
  }
  document.getElementById('removeDomain').onclick = async ()=>{
    const host = document.getElementById('domainInput').value || await getCurrentTabHost()
    if(!host){ alert('No host'); return }
    await removeDomainFromRouting(host)
  }
  await refreshRules()
}
