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

async function refreshRules(){
  const s = await getServer()
  const server = s.serverUrl || 'http://192.168.1.1:2017'
  const token = s.token
  const status = document.getElementById('status')
  status.textContent = ''
  const curHostEl = document.getElementById('currentHost')
  try{
    const hostNow = await getCurrentTabHost()
    if(curHostEl) curHostEl.textContent = hostNow || '-'
  }catch(e){ if(curHostEl) curHostEl.textContent = '-' }
  try{
    const resp = await callApi(server, token, '/api/routingA', 'GET')
    if(!resp || resp.code !== 'SUCCESS' || !resp.data){
      const msg = resp && resp.message ? resp.message : 'no data'
      status.textContent = 'Cannot get rules: ' + msg
      return
    }
    const routing = resp.data.routingA || ''
    const host = await getCurrentTabHost()
    if(!host){ status.textContent = 'No host detected' }
    const allLines = routing.split('\n')
    // find existing block for this host
    const startMarker = host ? `# domain - web extension config: ${host}` : null
    const endMarker = host ? `# end domain - web extension config: ${host}` : null
    let blockLines = []
    if(host){
      const startIdx = allLines.findIndex(l=>l.trim().toLowerCase() === startMarker.toLowerCase())
      if(startIdx >= 0){
        const rest = allLines.slice(startIdx+1)
        const endRel = rest.findIndex(l=>l.trim().toLowerCase() === endMarker.toLowerCase())
        if(endRel >= 0){
          blockLines = rest.slice(0, endRel)
        }
      }
    }
    const matchedLines = host ? allLines.filter(l=>matchesHost(l, host)) : []
    const combined = [...new Set([...(blockLines||[]), ...(matchedLines||[])])]
    // store original displayed content for change detection
    window.__originalDisplayed = combined.join('\n')
    window.__originalBlockExists = (blockLines.length > 0)
    const ta = document.getElementById('rulesArea')
    if(ta) ta.value = combined.join('\n')
    const saveBtn = document.getElementById('saveRules')
    if(saveBtn) saveBtn.disabled = true
    if(combined.length === 0){ if(host) status.textContent = 'No site-specific rules found'; else status.textContent = 'No host detected' }
  }catch(e){ status.textContent = 'Cannot get rules: '+e.message }
}
function matchesHost(line, host){
  if(!line || !host) return false
  // ignore comment lines (block markers and comments)
  if(line.trim().startsWith('#')) return false
  const l = line.toLowerCase()
  const h = host.toLowerCase()
  if(l.includes(h)) return true
  // match domain(...) rules: extract inside parentheses
  const m = l.match(/domain\(([^)]+)\)/)
  if(m && m[1]){
    const inner = m[1].split(',').map(s=>s.trim())
    for(const token of inner){
      // strip possible prefixes like geosite: or domain:
      const t = token.replace(/^(geosite:|domain:)/, '').trim()
      if(t === h) return true
      if(t.endsWith('.' + h)) return true
      if(h.endsWith('.' + t)) return true
      if(t.includes(h)) return true
    }
  }
  return false
}

async function putRoutingA(newText, s){
  const server = s.serverUrl || 'http://192.168.1.1:2017'
  const token = s.token
  const status = document.getElementById('status')
  status.textContent = ''
  try{
    const resp = await callApi(server, token, '/api/routingA', 'PUT', {routingA: newText})
    if(!resp || resp.code !== 'SUCCESS'){
      const msg = resp && resp.message ? resp.message : 'unknown error'
      status.textContent = 'Update failed: ' + msg
      return false
    }
    // try to ask server to reload v2ray (best-effort)
    try{ const r2 = await callApi(server, token, '/api/v2ray', 'POST', {}); }catch(e){}
    status.textContent = 'Updated'
    await refreshRules()
    return true
  }catch(e){ status.textContent = 'Update failed: '+e.message; return false }
}


async function addDomainToRouting(host){
  const ta = document.getElementById('rulesArea')
  const status = document.getElementById('status')
  if(!ta){ if(status) status.textContent = 'No textarea found'; return }
  const rule = `domain(${host})->proxy`
  const cur = ta.value.split('\n').map(l=>l.trim()).filter(l=>l.length>0)
  if(cur.includes(rule)){ if(status) status.textContent = 'Rule already in textarea'; return }
  cur.push(rule)
  ta.value = cur.join('\n')
  // enable Save
  const saveBtn = document.getElementById('saveRules')
  if(saveBtn) saveBtn.disabled = false
  if(status) status.textContent = 'Added to textarea (click Save to apply)'
}

function draftKeyForHost(host){
  if(!host) return 'draft_rules_global'
  return 'draft_rules_' + host
}

async function removeDomainFromRouting(host){
  const s = await getServer()
  const status = document.getElementById('status')
  status.textContent = ''
  try{
    const resp = await callApi(s.serverUrl||'http://192.168.1.1:2017', s.token, '/api/routingA', 'GET')
    if(!resp || resp.code !== 'SUCCESS' || !resp.data){
      const msg = resp && resp.message ? resp.message : 'no data'
      status.textContent = 'Remove failed: ' + msg
      return
    }
    const text = resp.data.routingA || ''
    const rule = `domain(${host})->proxy`
    const lines = text.split('\n').filter(l=>l.trim() !== rule)
    await putRoutingA(lines.join('\n'), s)
  }catch(e){ status.textContent = 'Remove failed: '+e.message }
}

// Save edited site-specific rules: replace original site lines in full routingA
async function saveSiteRules(){
  const s = await getServer()
  const server = s.serverUrl || 'http://192.168.1.1:2017'
  const token = s.token
  const status = document.getElementById('status')
  status.textContent = 'Saving...'
  const saveBtn = document.getElementById('saveRules')
  if(saveBtn){ saveBtn.disabled = true; saveBtn.textContent = 'Saving...' }
  try{
    const resp = await callApi(server, token, '/api/routingA', 'GET')
    if(!resp || resp.code !== 'SUCCESS' || !resp.data){
      const msg = resp && resp.message ? resp.message : 'no data'
      status.textContent = 'Save failed: ' + msg
      if(saveBtn){ saveBtn.disabled = false; saveBtn.textContent = 'Save' }
      return
    }
    const routing = resp.data.routingA || ''
    const allLines = routing.split('\n')
    const editedText = document.getElementById('rulesArea').value || ''
    let editedLines = editedText.split('\n').map(l=>l.trim()).filter(l=>l.length>0)
    editedLines = [...new Set(editedLines)]
    // local validation before attempting to save
    const val = validateRoutingText(editedLines.join('\n'))
    if(!val.ok){
      status.textContent = 'Validation failed: ' + val.errors.join('; ')
      if(saveBtn){ saveBtn.disabled = false; saveBtn.textContent = 'Save' }
      return
    }
    const host = await getCurrentTabHost()
    if(!host){ status.textContent = 'No host detected'; if(saveBtn){ saveBtn.disabled = false; saveBtn.textContent = 'Save' } ; return }
    const startMarker = `# domain - web extension config: ${host}`
    const endMarker = `# end domain - web extension config: ${host}`
    // remove existing block for host and any lines that match host
    const remaining = []
    for(let i=0;i<allLines.length;i++){
      const ln = allLines[i]
      if(host && startMarker && ln.trim().toLowerCase() === startMarker.toLowerCase()){
        // skip until endMarker
        let j = i+1
        while(j<allLines.length && allLines[j].trim().toLowerCase() !== endMarker.toLowerCase()) j++
        i = j
        continue
      }
      if(host && matchesHost(ln, host)){
        continue
      }
      remaining.push(ln)
    }
    // if editedLines non-empty, append block at end
    if(editedLines.length > 0){
      remaining.push(startMarker)
      remaining.push(...editedLines)
      remaining.push(endMarker)
    }
    const newText = remaining.join('\n')
    const ok = await putRoutingA(newText, s)
    if(ok){
      status.textContent = 'Saved'
      const ta = document.getElementById('rulesArea')
      const newDisplayed = (ta && ta.value) ? ta.value.trim() : editedLines.join('\n')
      window.__originalDisplayed = newDisplayed
      window.__originalBlockExists = (editedLines.length > 0)
      // restore button text (kept disabled)
      if(saveBtn) saveBtn.textContent = 'Save'
      // reload active tab to reflect changed proxy/rules
      try{ chrome.tabs.query({active:true,currentWindow:true}, tabs=>{ if(tabs && tabs[0] && tabs[0].id) chrome.tabs.reload(tabs[0].id) }) }catch(e){}
    } else {
      // if failed, allow save again so user can retry after fixing
      if(saveBtn){ saveBtn.disabled = false; saveBtn.textContent = 'Save' }
    }
  }catch(e){ status.textContent = 'Save failed: '+e.message; if(saveBtn){ saveBtn.disabled = false; saveBtn.textContent = 'Save' } }
}

async function getCurrentTabHost(){
  return new Promise(res=>{
    chrome.tabs.query({active:true,currentWindow:true}, tabs=>{
      if(!tabs || tabs.length===0) return res(null)
      try{ const url = new URL(tabs[0].url); res(url.hostname) }catch(e){ res(null) }
    })
  })
}

function validateRoutingText(text){
  const errors = []
  const lines = text.split('\n')
  for(let i=0;i<lines.length;i++){
    const raw = lines[i]
    const l = raw.trim()
    if(l === '' || l.startsWith('#')) continue
    // basic checks: balanced parentheses
    const open = (l.match(/\(/g) || []).length
    const close = (l.match(/\)/g) || []).length
    if(open !== close){ errors.push(`line ${i+1}: unbalanced parentheses`) }
    // domain/ip rules should contain ')->' to separate action
    if(/\b(domain|ip)\s*\(/i.test(l)){
      if(!/\)\s*->/.test(l)){
        errors.push(`line ${i+1}: expected ')->' after domain/ip list`) }
    }
    // any rule with '->' should have RHS
    if(l.includes('->')){
      const parts = l.split('->')
      if(parts.length<2 || parts[1].trim() === ''){
        errors.push(`line ${i+1}: missing action after '->'`)
      }
    }
    // disallow control characters
    if(/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(l)){
      errors.push(`line ${i+1}: contains control characters`)
    }
  }
  return {ok: errors.length===0, errors}
}

window.onload = async ()=>{
  const btnRefresh = document.getElementById('btnRefresh')
  if(btnRefresh) btnRefresh.onclick = refreshRules
  const btnBack = document.getElementById('btnBack')
  if(btnBack) btnBack.onclick = ()=>{ location.href = 'popup.html' }
  const addBtn = document.getElementById('addDomain')
  if(addBtn) addBtn.onclick = async ()=>{
    const domainInput = document.getElementById('domainInput')
    const host = (domainInput && domainInput.value) ? domainInput.value : await getCurrentTabHost()
    if(!host){ const st = document.getElementById('status'); if(st) st.textContent = 'No host'; return }
    await addDomainToRouting(host)
  }
  const remBtn = document.getElementById('removeDomain')
  if(remBtn) remBtn.onclick = async ()=>{
    const domainInput = document.getElementById('domainInput')
    const host = (domainInput && domainInput.value) ? domainInput.value : await getCurrentTabHost()
    if(!host){ const st = document.getElementById('status'); if(st) st.textContent = 'No host'; return }
    await removeDomainFromRouting(host)
  }
  const saveBtn = document.getElementById('saveRules')
  if(saveBtn) saveBtn.onclick = saveSiteRules
  const ta = document.getElementById('rulesArea')
  if(ta && saveBtn){
    ta.addEventListener('input', async ()=>{
      const orig = (window.__originalDisplayed || '').trim()
      const cur = ta.value.trim()
      // autosave draft to storage per-host
      try{
        const host = await getCurrentTabHost()
        const key = draftKeyForHost(host)
        const obj = {}
        obj[key] = cur
        storage.set(obj)
      }catch(e){ }
      // live validation
      const val = validateRoutingText(cur)
      const statusEl = document.getElementById('status')
      if(!val.ok){
        if(statusEl) statusEl.textContent = 'Validation: ' + val.errors.join('; ')
        saveBtn.disabled = true
        return
      }else{
        if(statusEl) statusEl.textContent = ''
      }
      saveBtn.disabled = (orig === cur)
    })
  }
  await refreshRules()
  // after fetching rules from server, restore any local draft for this host
  try{
    const host = await getCurrentTabHost()
    const key = draftKeyForHost(host)
    storage.get([key], r=>{
      const ta = document.getElementById('rulesArea')
      const saveBtn = document.getElementById('saveRules')
      if(r && r[key] && ta){
        const draft = (r[key] || '').trim()
        if(draft && draft !== (ta.value||'').trim()){
          ta.value = draft
          if(saveBtn) saveBtn.disabled = ( (window.__originalDisplayed || '').trim() === draft )
          const st = document.getElementById('status')
          if(st) st.textContent = 'Restored local draft'
        }
      }
    })
  }catch(e){}
}
