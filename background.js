// Background service worker: capture attempted host for each tab
// so popup can show the host even if page failed to load.

const storage = chrome.storage.local

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
