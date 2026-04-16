// Background service worker: capture attempted host for each tab
// so popup can show the host even if page failed to load.

const storage = chrome.storage.local

// --- Background save logic ---
// Tracks whether a save operation is currently in progress
let _savingInProgress = false

async function bgCallApi(server, token, path, method='GET', body=null){
  const headers = {'Content-Type':'application/json'}
  if(token) headers['Authorization'] = 'Bearer ' + token
  const opts = {method, headers}
  if(body) opts.body = JSON.stringify(body)
  const r = await fetch(server.replace(/\/$/,'') + path, opts)
  if(!r.ok){ const txt = await r.text(); throw new Error(r.status + ' ' + txt) }
  return await r.json()
}

async function bgPutRoutingA(newText, serverUrl, token){
  const server = serverUrl || 'http://192.168.1.1:2017'
  const resp = await bgCallApi(server, token, '/api/routingA', 'PUT', {routingA: newText})
  if(!resp || resp.code !== 'SUCCESS'){
    const msg = resp && resp.message ? resp.message : 'unknown error'
    throw new Error('Update failed: ' + msg)
  }
  // reload v2ray (best-effort)
  try{ await bgCallApi(server, token, '/api/v2ray', 'POST', {}) }catch(e){}
  return true
}

// --- Browser proxy management ---
// Model:
// - proxy_enabled: master switch
// - proxy_domains: hostnames (and their subdomains) that should go through v2rayA
// - PAC routes matching hosts through proxy, everything else DIRECT
// - v2rayA server host is always DIRECT so the extension can reach its API
const PROXY_DEFAULTS = {
  proxy_enabled: true,
  proxy_host: '192.168.1.1',
  proxy_port: 20171,
  proxy_scheme: 'http',
  proxy_domains: []
}

function getProxyConfig(){
  return new Promise(res=>storage.get(Object.keys(PROXY_DEFAULTS), r=>{
    const cfg = {}
    for(const k of Object.keys(PROXY_DEFAULTS)){
      cfg[k] = (r && r[k] !== undefined && r[k] !== null) ? r[k] : PROXY_DEFAULTS[k]
    }
    if(!Array.isArray(cfg.proxy_domains)) cfg.proxy_domains = []
    res(cfg)
  }))
}

function parseServerHost(serverUrl){
  try{ return new URL(serverUrl).hostname.toLowerCase() }catch(e){ return '' }
}

function normalizeDomain(raw){
  let s = String(raw || '').trim().toLowerCase()
  if(!s) return ''
  // strip scheme
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
  // strip path / query / fragment
  s = s.split('/')[0].split('?')[0].split('#')[0]
  // strip port
  s = s.split(':')[0]
  // strip leading www.
  if(s.startsWith('www.')) s = s.substring(4)
  return s
}

// Reduce hostname to its registrable (base) domain using a small list of
// well-known multi-label TLDs. Not a full PSL, but covers common cases so
// that toggling from a subdomain proxies the whole eTLD+1 and all siblings.
const MULTI_PART_TLDS = new Set([
  'co.uk','org.uk','gov.uk','ac.uk','me.uk','net.uk',
  'com.ua','net.ua','org.ua','co.ua','biz.ua','in.ua',
  'com.ru','net.ru','org.ru','pp.ru',
  'com.au','net.au','org.au','edu.au','gov.au','id.au',
  'co.jp','ne.jp','or.jp','ac.jp','go.jp',
  'com.br','net.br','org.br',
  'co.kr','ne.kr','or.kr',
  'com.cn','net.cn','org.cn','gov.cn','edu.cn','ac.cn',
  'co.in','net.in','org.in','gen.in',
  'com.tr','net.tr','org.tr',
  'com.mx','com.ar','com.co','com.pe','com.ve',
  'co.il','co.za','co.nz','co.id','co.th',
])

function baseDomain(host){
  const h = normalizeDomain(host)
  if(!h) return ''
  if(/^(\d+\.){3}\d+$/.test(h)) return h
  const parts = h.split('.')
  if(parts.length <= 2) return h
  const last2 = parts.slice(-2).join('.')
  if(MULTI_PART_TLDS.has(last2) && parts.length >= 3){
    return parts.slice(-3).join('.')
  }
  return last2
}

// === Dynamic proxy: contacted domains of proxied tabs are also proxied ===
const _tabMainHost = new Map()   // tabId -> normalized main host
const _tabDynDomains = new Map() // tabId -> Set<normalized domain>
let _cachedProxyDomains = []     // sync cache of proxy_domains

function isHostMatchList(host, list){
  const h = normalizeDomain(host)
  if(!h) return false
  return list.some(d=>{
    const dd = normalizeDomain(d)
    return dd && (h === dd || h.endsWith('.' + dd))
  })
}

function getAllDynamicDomains(){
  const all = new Set()
  for(const [,domains] of _tabDynDomains){
    for(const d of domains) all.add(d)
  }
  return [...all]
}

let _applyTimer = null
function scheduleApplyProxy(){
  if(_applyTimer) return
  _applyTimer = setTimeout(()=>{
    _applyTimer = null
    applyProxy()
  }, 300)
}

// Persist associated domains per proxied host: proxy_assoc_<baseDomain> = [...]
function loadDynDomainsForHost(mainHost){
  return new Promise(res=>{
    const base = baseDomain(mainHost)
    if(!base){ res([]); return }
    const key = 'proxy_assoc_' + base
    storage.get([key], r=>{ res((r && Array.isArray(r[key])) ? r[key] : []) })
  })
}

const _saveDynTimers = new Map()
function scheduleSaveDynDomains(mainHost, domains){
  const base = baseDomain(mainHost)
  if(!base) return
  if(_saveDynTimers.has(base)) return
  _saveDynTimers.set(base, setTimeout(()=>{
    _saveDynTimers.delete(base)
    storage.set({['proxy_assoc_' + base]: [...domains]})
  }, 1000))
}

async function initDynamicDomains(){
  try{
    const cfg = await getProxyConfig()
    _cachedProxyDomains = cfg.proxy_domains || []
    const tabs = await chrome.tabs.query({})
    for(const tab of tabs){
      if(tab.id >= 0 && tab.url){
        try{
          const host = normalizeDomain(new URL(tab.url).hostname)
          if(host) _tabMainHost.set(tab.id, host)
          if(host && isHostMatchList(host, _cachedProxyDomains)){
            const saved = await loadDynDomainsForHost(host)
            if(saved.length) _tabDynDomains.set(tab.id, new Set(saved.map(normalizeDomain).filter(Boolean)))
          }
        }catch(e){}
      }
    }
  }catch(e){}
  applyProxy()
}

function buildPac(cfg, serverHost, dynamicDomains){
  const scheme = 'PROXY'
  const host = String(cfg.proxy_host).replace(/"/g,'')
  const port = parseInt(cfg.proxy_port, 10)
  const proxyStr = scheme + ' ' + host + ':' + port
  const allSet = new Set([
    ...(cfg.proxy_domains || []).map(normalizeDomain).filter(Boolean),
    ...(dynamicDomains || []).map(normalizeDomain).filter(Boolean)
  ])
  const domains = [...allSet]
  const bypass = [serverHost, cfg.proxy_host, 'localhost', '127.0.0.1']
    .map(x => String(x || '').toLowerCase()).filter(Boolean)
  // Note: no DIRECT fallback for matched domains — if proxy is unreachable
  // request fails instead of silently leaking the real IP.
  return [
    'function FindProxyForURL(url, host){',
    '  var h = (host||"").toLowerCase();',
    '  var bypass = ' + JSON.stringify(bypass) + ';',
    '  for(var i=0;i<bypass.length;i++){ if(h === bypass[i]) return "DIRECT"; }',
    '  if(/^(\\d+\\.){3}\\d+$/.test(h)){ return "DIRECT"; }',
    '  var nh = h.indexOf("www.") === 0 ? h.substring(4) : h;',
    '  var domains = ' + JSON.stringify(domains) + ';',
    '  for(var j=0;j<domains.length;j++){',
    '    var d = domains[j];',
    '    if(!d) continue;',
    '    if(nh === d || nh.endsWith("." + d) || h === d || h.endsWith("." + d)) return "' + proxyStr + '";',
    '  }',
    '  return "DIRECT";',
    '}'
  ].join('\n')
}

async function applyProxy(){
  try{
    if(!chrome.proxy || !chrome.proxy.settings){
      console.warn('[v2rayA] chrome.proxy not available')
      return
    }
    const cfg = await getProxyConfig()
    const s = await new Promise(res=>storage.get(['serverUrl'], res))
    const serverHost = parseServerHost(s.serverUrl || 'http://192.168.1.1:2017')
    const dynamicDomains = getAllDynamicDomains()
    if(!cfg.proxy_enabled || (!cfg.proxy_domains.length && !dynamicDomains.length)){
      chrome.proxy.settings.clear({scope: 'regular'}, ()=>{
        if(chrome.runtime.lastError) console.warn('[v2rayA] proxy.clear error:', chrome.runtime.lastError.message)
        else console.log('[v2rayA] proxy cleared')
      })
      return
    }
    const pac = buildPac(cfg, serverHost, dynamicDomains)
    const value = { mode: 'pac_script', pacScript: { data: pac, mandatory: false } }
    chrome.proxy.settings.set({value, scope: 'regular'}, ()=>{
      if(chrome.runtime.lastError) console.warn('[v2rayA] proxy.set error:', chrome.runtime.lastError.message)
      else console.log('[v2rayA] proxy applied:', cfg.proxy_scheme + '://' + cfg.proxy_host + ':' + cfg.proxy_port, 'domains:', cfg.proxy_domains, 'dynamic:', dynamicDomains)
    })
  }catch(e){ console.warn('[v2rayA] applyProxy error:', e) }
}

async function bgFetchPorts(){
  const s = await new Promise(res=>storage.get(['serverUrl','token'], res))
  const server = s.serverUrl || 'http://192.168.1.1:2017'
  const resp = await bgCallApi(server, s.token, '/api/ports', 'GET')
  if(!resp || resp.code !== 'SUCCESS') throw new Error((resp && resp.message) || 'fetch failed')
  return resp.data || {}
}

// Re-apply on startup (with dynamic domain init) and when relevant storage keys change
initDynamicDomains()
try{
  chrome.storage.onChanged.addListener((changes, area)=>{
    if(area !== 'local') return
    if('proxy_domains' in changes){
      _cachedProxyDomains = changes.proxy_domains.newValue || []
      // re-evaluate which tabs are dynamically proxied
      for(const [tabId, mainHost] of _tabMainHost){
        if(isHostMatchList(mainHost, _cachedProxyDomains)){
          if(!_tabDynDomains.has(tabId)) _tabDynDomains.set(tabId, new Set())
        } else {
          _tabDynDomains.delete(tabId)
        }
      }
    }
    if('serverUrl' in changes){ applyProxy(); return }
    for(const k of Object.keys(PROXY_DEFAULTS)){
      if(k in changes){ applyProxy(); return }
    }
  })
}catch(e){}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse)=>{
  if(msg && msg.type === 'PROXY_GET_CONFIG'){
    getProxyConfig().then(cfg=>sendResponse({ok:true, cfg})).catch(e=>sendResponse({ok:false, error:e.message}))
    return true
  }
  if(msg && msg.type === 'PROXY_SET_CONFIG'){
    const patch = msg.patch || {}
    const clean = {}
    for(const k of Object.keys(PROXY_DEFAULTS)){
      if(k in patch) clean[k] = patch[k]
    }
    if('proxy_domains' in clean && Array.isArray(clean.proxy_domains)){
      clean.proxy_domains = clean.proxy_domains.map(normalizeDomain).filter(Boolean)
    }
    if('proxy_host' in clean) clean.proxy_host = String(clean.proxy_host || '').trim()
    storage.set(clean, ()=>{ applyProxy().then(()=>sendResponse({ok:true})) })
    return true
  }
  if(msg && msg.type === 'PROXY_TOGGLE_DOMAIN'){
    const host = baseDomain(msg.host)
    if(!host){ sendResponse({ok:false, error:'empty host'}); return false }
    getProxyConfig().then(cfg=>{
      const list = Array.isArray(cfg.proxy_domains) ? cfg.proxy_domains.slice() : []
      // a host is considered "already on" if stored domain matches or is a parent
      const matchIdx = list.findIndex(d=>{
        const dd = normalizeDomain(d)
        return dd === host || host.endsWith('.' + dd)
      })
      let added
      if(matchIdx >= 0){
        list.splice(matchIdx,1); added = false
        // clean up saved associated domains
        try{ storage.remove(['proxy_assoc_' + baseDomain(host)]) }catch(e){}
      } else { list.push(host); added = true }
      storage.set({proxy_domains: list}, ()=>{ applyProxy().then(()=>sendResponse({ok:true, added, list, host})) })
    })
    return true
  }
  if(msg && msg.type === 'PROXY_DEBUG'){
    (async ()=>{
      const cfg = await getProxyConfig()
      const s = await new Promise(res=>storage.get(['serverUrl'], res))
      const serverHost = parseServerHost(s.serverUrl || 'http://192.168.1.1:2017')
      const pac = buildPac(cfg, serverHost)
      const settings = await new Promise(res=>{
        try{ chrome.proxy.settings.get({}, v=>res(v)) }catch(e){ res({error:e.message}) }
      })
      sendResponse({ok:true, cfg, serverHost, pac, settings})
    })()
    return true
  }
  if(msg && msg.type === 'PROXY_FETCH_PORTS'){
    bgFetchPorts().then(data=>sendResponse({ok:true, data})).catch(e=>sendResponse({ok:false, error:e.message}))
    return true
  }
  if(msg && msg.type === 'SAVE_ROUTING'){
    _savingInProgress = true
    storage.set({_saveInProgress: true})
    const {newText, serverUrl, token} = msg
    bgPutRoutingA(newText, serverUrl, token)
      .then(()=>{
        _savingInProgress = false
        storage.set({_saveInProgress: false})
        sendResponse({ok: true})
      })
      .catch(e=>{
        _savingInProgress = false
        storage.set({_saveInProgress: false})
        sendResponse({ok: false, error: e.message})
      })
    return true // keep message channel open for async response
  }
  if(msg && msg.type === 'IS_SAVING'){
    sendResponse({saving: _savingInProgress})
    return false
  }
})

function storeHostForTab(tabId, host){
  if(tabId === undefined || tabId === null || tabId < 0) return
  const keyHost = 'host_for_tab_' + tabId
  const keyDomains = 'domains_for_tab_' + tabId
  try{
    const obj = {}
    obj[keyHost] = host
    storage.set(obj)
    // update domains set
    storage.get([keyDomains], r=>{
      let arr = []
      if(r && Array.isArray(r[keyDomains])) arr = r[keyDomains]
      if(host && !arr.includes(host)){
        arr.push(host)
        const o = {}
        o[keyDomains] = arr
        storage.set(o)
      }
    })
  }catch(e){}
}

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    try{
      const tabId = details.tabId
      if(tabId === undefined || tabId === null || tabId < 0) return
      const url = new URL(details.url)
      const host = url.hostname
      if(host) storeHostForTab(tabId, host)

      // --- Dynamic proxy tracking ---
      const normalized = normalizeDomain(host)
      if(!normalized) return
      if(details.type === 'main_frame'){
        _tabMainHost.set(tabId, normalized)
        const hadDyn = _tabDynDomains.has(tabId) && _tabDynDomains.get(tabId).size > 0
        _tabDynDomains.delete(tabId)
        if(isHostMatchList(normalized, _cachedProxyDomains)){
          _tabDynDomains.set(tabId, new Set())
          // pre-load saved associated domains so they're proxied from the start
          loadDynDomainsForHost(normalized).then(saved=>{
            const set = _tabDynDomains.get(tabId)
            if(!set) return
            let changed = false
            for(const d of saved){
              const nd = normalizeDomain(d)
              if(nd && !set.has(nd)){ set.add(nd); changed = true }
            }
            if(changed) scheduleApplyProxy()
          })
        } else if(hadDyn){
          scheduleApplyProxy()
        }
      }
      // If tab's main host is in proxy list, add contacted domain dynamically
      if(_tabDynDomains.has(tabId)){
        const dynSet = _tabDynDomains.get(tabId)
        if(!dynSet.has(normalized)){
          dynSet.add(normalized)
          scheduleApplyProxy()
          // persist for future visits
          const mainHost = _tabMainHost.get(tabId)
          if(mainHost) scheduleSaveDynDomains(mainHost, dynSet)
        }
      }
    }catch(e){ }
  },
  { urls: ["<all_urls>"] }
)

// Listen for request errors (failed requests) to mark domains as failed
chrome.webRequest.onErrorOccurred.addListener(
  (details) => {
    try{
      const tabId = details.tabId
      if(tabId === undefined || tabId === null || tabId < 0) return
      // some error entries may not have a valid url
      if(!details || !details.url) return
      const url = new URL(details.url)
      const host = url.hostname
      if(!host) return
      const keyFailed = 'failed_domains_for_tab_' + tabId
      storage.get([keyFailed], r=>{
        let arr = []
        if(r && Array.isArray(r[keyFailed])) arr = r[keyFailed]
        if(!arr.includes(host)){
          arr.push(host)
          const o = {}
          o[keyFailed] = arr
          storage.set(o)
        }
      })
    }catch(e){ }
  },
  { urls: ["<all_urls>"] }
)

// Periodic cleanup: remove per-tab keys for tabs that no longer exist
function cleanupStaleTabData(){
  try{
    chrome.tabs.query({}, tabs=>{
      const openIds = new Set((tabs||[]).map(t=>String(t.id)))
      storage.get(null, all=>{
        const keys = Object.keys(all || {})
        const toRemove = []
        for(const k of keys){
          const m = k.match(/_(\d+)$/)
          if(m && m[1]){
            const id = m[1]
            if(!openIds.has(id)) toRemove.push(k)
          }
        }
        if(toRemove.length>0){
          try{ storage.remove(toRemove) }catch(e){}
        }
      })
    })
  }catch(e){}
}

// Use alarms to run cleanup periodically (MV3-friendly)
try{
  if(chrome.alarms){
    chrome.alarms.create('cleanup_tabs', { periodInMinutes: 5 })
    chrome.alarms.onAlarm.addListener(alarm=>{ if(alarm && alarm.name === 'cleanup_tabs') cleanupStaleTabData() })
  }
}catch(e){}

// run once on worker start
cleanupStaleTabData()

// Clean up stored host and domains when tab is removed to avoid stale entries
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  try{ storage.remove(['host_for_tab_' + tabId, 'domains_for_tab_' + tabId, 'domain_stats_for_tab_' + tabId]) }catch(e){}
  _tabMainHost.delete(tabId)
  if(_tabDynDomains.has(tabId)){
    _tabDynDomains.delete(tabId)
    scheduleApplyProxy()
  }
})

// Helpers to track per-domain stats per tab
function markDomainOk(tabId, url){
  try{
    const host = new URL(url).hostname
    const key = 'domain_stats_for_tab_' + tabId
    storage.get([key], r=>{
      const map = (r && r[key] && typeof r[key] === 'object') ? r[key] : {}
      const cur = map[host] || {ok:0, failed:0}
      cur.ok = (cur.ok||0) + 1
      // if there were previous failures, decrement them on success
      if(cur.failed && cur.failed > 0){
        cur.failed = Math.max(0, (cur.failed||0) - 1)
        if(cur.failed === 0){
          // clear last error/status when no failures remain
          delete cur.last
        }
      }
      map[host] = cur
      const obj = {}; obj[key] = map
      storage.set(obj)
    })
  }catch(e){}
}

function markDomainFailed(tabId, url, last){
  try{
    const host = new URL(url).hostname
    const key = 'domain_stats_for_tab_' + tabId
    storage.get([key], r=>{
      const map = (r && r[key] && typeof r[key] === 'object') ? r[key] : {}
      const cur = map[host] || {ok:0, failed:0}
      cur.failed = (cur.failed||0) + 1
      cur.last = last
      map[host] = cur
      const obj = {}; obj[key] = map
      storage.set(obj)
    })
  }catch(e){}
}

// Mark completed requests: HTTP errors (>=403) are failures, others count as ok
chrome.webRequest.onCompleted.addListener(
  (details) => {
    try{
      const tabId = details.tabId
      if(tabId === undefined || tabId === null || tabId < 0) return
      if(!details || !details.url) return
      const status = details.statusCode
      if(typeof status === 'number' && status >= 403){
        markDomainFailed(tabId, details.url, status)
      } else {
        markDomainOk(tabId, details.url)
      }
    }catch(e){}
  },
  { urls: ["<all_urls>"] }
)

// Listen for request errors (connection errors) to mark domains as failed
chrome.webRequest.onErrorOccurred.addListener(
  (details) => {
    try{
      const tabId = details.tabId
      if(tabId === undefined || tabId === null || tabId < 0) return
      if(!details || !details.url) return
      // ignore extension blocking
      if(details.error === 'net::ERR_BLOCKED_BY_CLIENT') return
      markDomainFailed(tabId, details.url, details.error || 'error')
    }catch(e){}
  },
  { urls: ["<all_urls>"] }
)
