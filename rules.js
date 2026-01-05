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
    // store original displayed content for change detection (current host tab)
    window.__originalDisplayed_current = combined.join('\n')
    window.__originalBlockExists = (blockLines.length > 0)
    const taCur = document.getElementById('rulesAreaCurrent')
    if(taCur) taCur.value = combined.join('\n')
    // update visual diff for the active tab (current or global)
    try{ updateDiff(window.__activeTab === 'global' ? 'global' : 'current') }catch(e){}
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

// Update visual diff panel for the given tab ('current' or 'global')
function updateDiff(tab){
  const diffEl = document.getElementById('rulesDiff')
  if(!diffEl) return
  const taId = (tab === 'global') ? 'rulesAreaGlobal' : 'rulesAreaCurrent'
  const ta = document.getElementById(taId)
  if(!ta) { diffEl.innerHTML = ''; return }
  const serverText = (tab === 'global') ? (window.__originalDisplayed_global || '') : (window.__originalDisplayed_current || '')
  const serverSet = new Set(serverText.split('\n').map(l=> (l||'').trim()))
  const lines = ta.value === '' ? [] : ta.value.split('\n')
  const parts = lines.map((line, idx)=>{
    const kind = serverSet.has((line||'').trim()) ? 'server' : 'local'
    const esc = (line||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    return `<div class="diff-line ${kind}"><span class="line-num">${idx+1}</span><span class="line-text">${esc}</span></div>`
  })
  diffEl.innerHTML = parts.join('')
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

// Toggle to global view: fetch full routingA and show as-is (rows=20)
async function enterGlobalMode(){
  const ta = document.getElementById('rulesAreaGlobal')
  const status = document.getElementById('status')
  window.__preGlobalDisplayed = (ta && ta.value) ? ta.value : ''
  window.__activeTab = 'global'
  if(ta) ta.rows = 15
  try{
    const s = await getServer()
    const resp = await callApi(s.serverUrl||'http://192.168.1.1:2017', s.token, '/api/routingA', 'GET')
    const full = resp && resp.data && resp.data.routingA ? resp.data.routingA : ''
    if(ta) ta.value = full
    // store original for global tab
    window.__originalDisplayed_global = (ta && ta.value) ? ta.value : ''
    // normalized version for comparison (preserve textarea content as-is)
    window.__originalDisplayed_global_norm = (window.__originalDisplayed_global || '').replace(/\r/g,'')
    // restore local global draft if present
    try{
      storage.get(['draft_rules_global'], r=>{
        if(r && typeof r['draft_rules_global'] === 'string'){
          const draft = r['draft_rules_global']
          if(draft !== (ta.value || '')){
            if(ta) ta.value = draft
            const st = document.getElementById('status')
            if(st) st.textContent = 'Restored local global draft'
          }
        }
      })
    }catch(e){}
    const val = validateRoutingText(ta.value || '')
    const saveBtn = document.getElementById('saveRules')
    if(!val.ok){ if(status) status.textContent = 'Validation: ' + val.errors.join('; '); if(saveBtn) saveBtn.disabled = true }
    else { if(status) status.textContent = ''; if(saveBtn) saveBtn.disabled = false }
  }catch(e){ if(status) status.textContent = 'Cannot fetch full config: ' + (e.message||e) }
}

// Return to host-specific view; if revert=true, cancel unsaved changes and restore previous displayed content
function enterHostMode(revert){
  window.__activeTab = 'current'
  const ta = document.getElementById('rulesAreaCurrent')
  const status = document.getElementById('status')
  const saveBtn = document.getElementById('saveRules')
  if(ta){ ta.rows = 5; if(revert){ ta.value = (window.__preGlobalDisplayed || window.__originalDisplayed_current || '') } }
  const cur = (ta && ta.value) ? ta.value : ''
  const orig = (window.__originalDisplayed_current || '')
  // normalized for comparison
  const orig_norm = (orig || '').replace(/\r/g,'')
  const cur_norm = (cur || '').replace(/\r/g,'')
  const val = validateRoutingText(cur)
  if(!val.ok){ if(status) status.textContent = 'Validation: ' + val.errors.join('; '); if(saveBtn) saveBtn.disabled = true }
  else { if(status) status.textContent = ''; if(saveBtn) saveBtn.disabled = (orig_norm === cur_norm) }
}


async function addDomainToRouting(host){
  const status = document.getElementById('status')
  // choose target textarea based on active tab
  const targetId = (window.__activeTab === 'global') ? 'rulesAreaGlobal' : 'rulesAreaCurrent'
  const ta = document.getElementById(targetId)
  if(!ta){ if(status) status.textContent = 'No textarea found'; return }
  const rule = `domain(${host})->proxy`
  // preserve existing whitespace; only trim for duplicate detection
  const lines = ta.value === '' ? [] : ta.value.split('\n')
  const exists = lines.some(l => (l || '').trim() === rule)
  if(exists){ if(status) status.textContent = 'Rule already in textarea'; return }
  lines.push(rule)
  ta.value = lines.join('\n')
  // if current tab — update local draft for host as exact textarea content
  if(targetId === 'rulesAreaCurrent'){
    try{
      const keyHost = await getCurrentTabHost()
      const key = draftKeyForHost(keyHost)
      if(key){ const obj = {}; obj[key] = ta.value; storage.set(obj) }
    }catch(e){}
  }
  // enable Save
  const saveBtn = document.getElementById('saveRules')
  if(saveBtn) saveBtn.disabled = false
  if(status) status.textContent = 'Added to textarea (click Save to apply)'
  // update diff when adding
  try{ updateDiff(window.__activeTab === 'global' ? 'global' : 'current') }catch(e){}
}

function draftKeyForHost(host){
  // Return null when no host – we no longer keep a separate global draft.
  if(!host) return null
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
    const editedText = (window.__activeTab === 'global') ? (document.getElementById('rulesAreaGlobal').value || '') : (document.getElementById('rulesAreaCurrent').value || '')
    // local validation before attempting to save (validate full text as-is)
    const val = validateRoutingText(editedText)
    if(!val.ok){
      status.textContent = 'Validation failed: ' + val.errors.join('; ')
      if(saveBtn){ saveBtn.disabled = false; saveBtn.textContent = 'Save' }
      return
    }
    // If in global tab, save entire text as-is (no markers)
    if(window.__activeTab === 'global'){
      const newTextGlobal = editedText
      const okg = await putRoutingA(newTextGlobal, s)
      if(okg){
        status.textContent = 'Saved'
        window.__originalDisplayed_global = newTextGlobal
        window.__originalDisplayed_global_norm = (newTextGlobal || '').replace(/\r/g,'')
        window.__originalBlockExists = false
        if(saveBtn) saveBtn.textContent = 'Save'
        try{ chrome.tabs.query({active:true,currentWindow:true}, tabs=>{ if(tabs && tabs[0] && tabs[0].id) chrome.tabs.reload(tabs[0].id) }) }catch(e){}
      } else {
        if(saveBtn){ saveBtn.disabled = false; saveBtn.textContent = 'Save' }
      }
      return
    }

    // host-specific mode: remove existing block/lines that match host and append edited text as-is (WITHOUT adding start/end markers)
    const host = await getCurrentTabHost()
    if(!host){ status.textContent = 'No host detected'; if(saveBtn){ saveBtn.disabled = false; saveBtn.textContent = 'Save' } ; return }
    const startMarker = `# domain - web extension config: ${host}`
    const endMarker = `# end domain - web extension config: ${host}`
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
    // build new text preserving whitespace and wrap editedText in markers for this host
    const base = remaining.join('\n')
    // if editedText is empty or only whitespace, remove any existing block (do not create empty marker block)
    let newText = ''
    const editedTrim = editedText.split('\n').map(l=>l.trim()).filter(l=>l.length>0).join('\n')
    if(!editedTrim){
      // just keep remaining (no block)
      newText = base
    } else {
      const blockLines = [startMarker, ...(editedText === '' ? [] : editedText.split('\n')), endMarker]
      if(base === '') newText = blockLines.join('\n')
      else newText = base + '\n' + blockLines.join('\n')
    }
    const ok = await putRoutingA(newText, s)
    if(ok){
      status.textContent = 'Saved'
      const taCur = document.getElementById('rulesAreaCurrent')
      const newDisplayed = (taCur && taCur.value) ? taCur.value : editedText
      window.__originalDisplayed_current = newDisplayed
      window.__originalBlockExists = !!editedTrim
      // update global textarea and local draft so Global reflects saved server config
      try{
        const key = 'draft_rules_global'
        const obj = {}
        obj[key] = newText
        storage.set(obj)
      }catch(e){}
      try{
        const taGlobEl = document.getElementById('rulesAreaGlobal')
        if(taGlobEl) taGlobEl.value = newText
        window.__originalDisplayed_global = newText
        window.__originalDisplayed_global_norm = (newText || '').replace(/\r/g,'')
      }catch(e){}
      // restore button text (kept disabled)
      if(saveBtn) saveBtn.textContent = 'Save'
      // update diff after successful save
      try{ updateDiff('current') }catch(e){}
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
      const tab = tabs[0]
      const tabId = tab.id
      // Try to get hostname from the visible tab URL first
      try{
        if(tab && tab.url){
          const url = new URL(tab.url)
          if(url && url.hostname) return res(url.hostname)
        }
      }catch(e){ /* fallthrough to stored fallback */ }
      // Fallback: check background-captured host for this tab
      if(!tabId && tabId !== 0) return res(null)
      const key = 'host_for_tab_' + tabId
      storage.get([key], r=>{
        if(r && typeof r[key] === 'string' && r[key]) return res(r[key])
        return res(null)
      })
    })
  })
}

async function getCurrentTabDomains(){
  return new Promise(res=>{
    chrome.tabs.query({active:true,currentWindow:true}, tabs=>{
      if(!tabs || tabs.length===0) return res([])
      const tab = tabs[0]
      const tabId = tab.id
      // always read stored domains and merge with tab.url host (if any)
      if(tabId === undefined || tabId === null) return res([])
      const key = 'domains_for_tab_' + tabId
      const statsKey = 'domain_stats_for_tab_' + tabId
      storage.get([key, statsKey], r=>{
        const stored = (r && Array.isArray(r[key])) ? r[key].slice() : []
        const stats = (r && r[statsKey] && typeof r[statsKey] === 'object') ? r[statsKey] : {}
        // try to add page's own host as well (may be missing in stored list)
        try{
          if(tab && tab.url){
            const url = new URL(tab.url)
            if(url && url.hostname && !stored.includes(url.hostname)) stored.unshift(url.hostname)
          }
        }catch(e){ }
        // ensure uniqueness and preserve order
        const uniqHosts = []
        for(const h of stored){ if(h && !uniqHosts.includes(h)) uniqHosts.push(h) }
        // also include any hosts from stats that might not be in stored list
        for(const h of Object.keys(stats || {})){ if(h && !uniqHosts.includes(h)) uniqHosts.push(h) }
        const result = uniqHosts.map(h=>{
          const s = stats && stats[h] ? stats[h] : null
          const failed = !!(s && s.failed && s.failed > 0)
          const status = s && s.last !== undefined ? s.last : null
          return {host: h, failed, status}
        })
        return res(result)
      })
    })
  })
}

function isRuleInTextareaForActiveTab(rule){
  const taId = (window.__activeTab === 'global') ? 'rulesAreaGlobal' : 'rulesAreaCurrent'
  const ta = document.getElementById(taId)
  if(!ta) return false
  const lines = ta.value === '' ? [] : ta.value.split('\n')
  return lines.some(l => (l||'').trim() === rule)
}

async function removeDomainFromTextarea(host){
  const rule = `domain(${host})->proxy`
  const taId = (window.__activeTab === 'global') ? 'rulesAreaGlobal' : 'rulesAreaCurrent'
  const ta = document.getElementById(taId)
  if(!ta) return false
  const lines = ta.value === '' ? [] : ta.value.split('\n')
  const filtered = lines.filter(l => (l||'').trim() !== rule)
  ta.value = filtered.join('\n')
  // update local draft storage
  try{
    if(window.__activeTab === 'global'){
      storage.set({'draft_rules_global': ta.value})
    } else {
      const hostKey = await getCurrentTabHost()
      const key = draftKeyForHost(hostKey)
      if(key){ const obj = {}; obj[key] = ta.value; storage.set(obj) }
    }
  }catch(e){}
  try{ updateDiff(window.__activeTab === 'global' ? 'global' : 'current') }catch(e){}
  // enable Save since textarea was modified programmatically
  try{
    const saveBtn = document.getElementById('saveRules')
    if(saveBtn) saveBtn.disabled = false
  }catch(e){}
  return true
}

function showDomainsModal(domains){
  let modal = document.getElementById('domainsModal')
  if(modal) modal.remove()
  modal = document.createElement('div')
  modal.id = 'domainsModal'
  modal.style = 'position:fixed;left:10%;top:10%;width:80%;height:80%;background:#fff;border:1px solid #888;box-shadow:0 2px 10px rgba(0,0,0,0.5);z-index:9999;padding:12px;overflow:auto;'

  const header = document.createElement('div')
  header.style = 'display:flex;align-items:center;justify-content:space-between'
  const title = document.createElement('h3')
  title.textContent = 'Contacted domains'
  const rightBtns = document.createElement('div')
  rightBtns.style = 'display:flex;gap:8px;align-items:center'
  // refresh button (left of Close)
  const refreshBtn = document.createElement('button')
  refreshBtn.title = 'Refresh domains'
  const rimg = document.createElement('img')
  rimg.src = 'icons/reload.svg'
  rimg.alt = 'refresh'
  rimg.style = 'width:16px;height:16px'
  refreshBtn.appendChild(rimg)
  refreshBtn.onclick = async (e)=>{
    e.preventDefault(); e.stopPropagation()
    try{
      const st = document.getElementById('status')
      if(st) st.textContent = 'Refreshing domains...'
      const domains = await getCurrentTabDomains()
      // re-render modal with updated domains
      showDomainsModal(domains)
    }catch(err){ const st = document.getElementById('status'); if(st) st.textContent = 'Refresh failed: '+(err.message||err) }
  }
  // make buttons same height and style
  refreshBtn.style = 'height:30px;display:inline-flex;align-items:center;justify-content:center;padding:4px 8px;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer'

  const closeBtn = document.createElement('button')
  closeBtn.textContent = 'Close'
  closeBtn.onclick = ()=>{ modal.remove() }
  closeBtn.style = 'height:30px;display:inline-flex;align-items:center;justify-content:center;padding:4px 12px;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer'
  rightBtns.appendChild(refreshBtn)
  rightBtns.appendChild(closeBtn)
  header.appendChild(title)
  header.appendChild(rightBtns)
  modal.appendChild(header)

  const list = document.createElement('ul')
  list.style = 'list-style:none;padding:0;margin:8px 0;max-height:calc(100% - 80px);overflow:auto'
  if(!domains || domains.length === 0){
    const p = document.createElement('div')
    p.textContent = '(no domains)'
    modal.appendChild(p)
    document.body.appendChild(modal)
    return
  }

  // sort: failed domains first
  const items = (domains || []).slice().sort((a,b)=>{
    const fa = (typeof a === 'object' && a && a.failed) ? 1 : 0
    const fb = (typeof b === 'object' && b && b.failed) ? 1 : 0
    return fb - fa
  })

  items.forEach(d=>{
    const li = document.createElement('li')
    li.style = 'display:flex;align-items:center;justify-content:space-between;padding:6px 4px;border-bottom:1px solid #eee'
    const span = document.createElement('span')
    const host = (typeof d === 'string') ? d : (d && d.host) ? d.host : ''
    const failed = (typeof d === 'object') ? !!d.failed : false
    const status = (typeof d === 'object') ? (d.status !== undefined ? d.status : (d.last !== undefined ? d.last : null)) : null
    span.textContent = host
    span.style = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-right:8px'
    // prepare left-side failure marker
    let failMark = null
    if(failed){
      failMark = document.createElement('img')
      failMark.src = 'icons/alert-outline.svg'
      failMark.alt = 'failed'
      failMark.style = 'width:16px;height:16px;margin-right:8px;flex:0'
    }

    const actions = document.createElement('div')
    actions.style = 'display:flex;gap:8px;align-items:center'
    const rule = `domain(${host})->proxy`
    // toggle icon
    const toggleImg = document.createElement('img')
    toggleImg.src = isRuleInTextareaForActiveTab(rule) ? 'icons/delete.svg' : 'icons/plus.svg'
    toggleImg.alt = isRuleInTextareaForActiveTab(rule) ? 'remove' : 'add'
    toggleImg.title = isRuleInTextareaForActiveTab(rule) ? 'Remove rule from textarea' : 'Add rule to textarea'
    toggleImg.style = 'width:18px;height:18px;cursor:pointer'
    toggleImg.onclick = async (e)=>{
      e.preventDefault(); e.stopPropagation()
      if(toggleImg.src && toggleImg.src.endsWith('plus.svg')){
        await addDomainToRouting(host)
        toggleImg.src = 'icons/delete.svg'
        toggleImg.title = 'Remove rule from textarea'
      } else {
        await removeDomainFromTextarea(host)
        toggleImg.src = 'icons/plus.svg'
        toggleImg.title = 'Add rule to textarea'
      }
    }

    // copy icon
    const copyImg = document.createElement('img')
    copyImg.src = 'icons/content-copy.svg'
    copyImg.alt = 'copy'
    copyImg.title = 'Copy domain to clipboard'
    copyImg.style = 'width:18px;height:18px;cursor:pointer'
    copyImg.onclick = (e)=>{
      e.preventDefault(); e.stopPropagation()
      const toCopy = host
      if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(toCopy)
      } else {
        try{ const ta = document.createElement('textarea'); ta.value = toCopy; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove() }catch(e){}
      }
    }

    actions.appendChild(toggleImg)
    actions.appendChild(copyImg)
    if(failMark){
      const tooltip = (status !== null) ? String(status) : 'failed'
      failMark.title = tooltip
      li.appendChild(failMark)
    }
    li.appendChild(span)
    li.appendChild(actions)
    list.appendChild(li)
  })

  modal.appendChild(list)
  document.body.appendChild(modal)
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
  const showBtn = document.getElementById('showDomains')
  if(showBtn) showBtn.onclick = async ()=>{
    const st = document.getElementById('status')
    try{
      const domains = await getCurrentTabDomains()
      if(domains && domains.length>0){ showDomainsModal(domains); if(st) st.textContent = '' }
      else { if(st) st.textContent = 'No domains recorded for this tab' }
    }catch(e){ if(st) st.textContent = 'Cannot read domains: '+e.message }
  }
  // Tabs setup: two separate textareas (current/global)
  const tabCurrent = document.getElementById('tabCurrent')
  const tabGlobal = document.getElementById('tabGlobal')
  const taCur = document.getElementById('rulesAreaCurrent')
  const taGlob = document.getElementById('rulesAreaGlobal')
  // default to current tab
  window.__activeTab = 'current'
  function showTab(name){
    if(name === 'current'){
      if(tabCurrent) tabCurrent.classList.add('active')
      if(tabGlobal) tabGlobal.classList.remove('active')
      if(taCur) taCur.style.display = ''
      if(taGlob) taGlob.style.display = 'none'
      enterHostMode(false)
      try{ updateDiff('current') }catch(e){}
    } else {
      if(tabGlobal) tabGlobal.classList.add('active')
      if(tabCurrent) tabCurrent.classList.remove('active')
      if(taCur) taCur.style.display = 'none'
      if(taGlob) taGlob.style.display = ''
      // disable Save while loading global content to avoid flicker
      const saveBtn = document.getElementById('saveRules')
      if(saveBtn) saveBtn.disabled = true
      // load global content
      enterGlobalMode().catch(()=>{}).finally(()=>{
        if(saveBtn){
          // compare normalized to decide enabled state
          const orig_norm = (window.__originalDisplayed_global_norm || '')
          const cur_norm = ( (document.getElementById('rulesAreaGlobal')||{value:''}).value || '' ).replace(/\r/g,'')
          saveBtn.disabled = (orig_norm === cur_norm)
        }
        try{ updateDiff('global') }catch(e){}
      })
    }
  }
  if(tabCurrent) tabCurrent.addEventListener('click', ()=> showTab('current'))
  if(tabGlobal) tabGlobal.addEventListener('click', ()=> showTab('global'))

  // Input handler for current textarea (autosave per-host)
  if(taCur && saveBtn){
    taCur.addEventListener('input', async ()=>{
      const orig = (window.__originalDisplayed_current || '')
      const cur = taCur.value
      try{
        const host = await getCurrentTabHost()
        const key = draftKeyForHost(host)
        if(key){ const obj = {}; obj[key] = cur; storage.set(obj) }
      }catch(e){}
      // normalize for comparison to avoid CRLF issues
      const orig_norm = (orig || '').replace(/\r/g,'')
      const cur_norm = (cur || '').replace(/\r/g,'')
      const val = validateRoutingText(cur)
      const statusEl = document.getElementById('status')
      if(!val.ok){ if(statusEl) statusEl.textContent = 'Validation: ' + val.errors.join('; '); saveBtn.disabled = true; return }
      else { if(statusEl) statusEl.textContent = '' }
      saveBtn.disabled = (orig_norm === cur_norm)
      try{ updateDiff('current') }catch(e){}
    })
  }

  // Input handler for global textarea (no local draft)
  if(taGlob && saveBtn){
    taGlob.addEventListener('input', async ()=>{
      const orig = (window.__originalDisplayed_global || '')
      const cur = taGlob.value
      // save global draft to local storage
      try{ storage.set({'draft_rules_global': cur}) }catch(e){}
      const val = validateRoutingText(cur)
      const statusEl = document.getElementById('status')
      if(!val.ok){ if(statusEl) statusEl.textContent = 'Validation: ' + val.errors.join('; '); saveBtn.disabled = true; return }
      else { if(statusEl) statusEl.textContent = '' }
      // compare normalized to avoid CRLF issues
      const orig_norm = (orig || '').replace(/\r/g,'')
      const cur_norm = (cur || '').replace(/\r/g,'')
      saveBtn.disabled = (orig_norm === cur_norm)
      try{ updateDiff('global') }catch(e){}
    })
  }
  await refreshRules()
  // after fetching rules from server, restore any local draft for this host
  try{
    const host = await getCurrentTabHost()
    const key = draftKeyForHost(host)
    storage.get([key], r=>{
      const ta = document.getElementById('rulesAreaCurrent')
      const saveBtn = document.getElementById('saveRules')
      if(r && typeof r[key] === 'string' && ta){
        const draft = r[key]
          if(draft && draft !== (ta.value||'')){
          ta.value = draft
          if(saveBtn) saveBtn.disabled = ( (window.__originalDisplayed_current || '') === draft )
          const st = document.getElementById('status')
          if(st) st.textContent = 'Restored local draft'
          try{ updateDiff('current') }catch(e){}
        }
      }
    })
  }catch(e){}
}
