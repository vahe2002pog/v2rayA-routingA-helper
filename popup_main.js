document.addEventListener('DOMContentLoaded', async ()=>{
	// if user not authorized, open settings automatically
	try{
		if(typeof getServer === 'function'){
			const s = await getServer()
			if(!s || !s.token){ location.href = 'settings.html'; return }
		}
	}catch(e){ /* fallthrough to UI if check fails */ }
	const openSettings = document.getElementById('openSettings')
	if(openSettings) openSettings.addEventListener('click', ()=>{ location.href = 'settings.html' })
		const headerRefresh = document.getElementById('headerRefresh')
		if(headerRefresh){
			headerRefresh.addEventListener('click', async ()=>{
					if(typeof refreshRules === 'function') refreshRules()
				// try to immediately update currentHost display too
				if(typeof getCurrentTabHost === 'function'){
					try{ const h = await getCurrentTabHost(); const el = document.getElementById('currentHost'); if(el) el.textContent = h || '-' }catch(e){}
				}
					// clear local draft for current host
					try{
						if(typeof getCurrentTabHost === 'function'){
							const h2 = await getCurrentTabHost()
							if(h2){ const key = 'draft_rules_' + h2; chrome.storage.local.remove([key], ()=>{} ) }
							// also clear global draft
							try{ chrome.storage.local.remove(['draft_rules_global'], ()=>{} ) }catch(e){}
						}
					}catch(e){}
				// also reload active tab to reflect changes
				try{ chrome.tabs.query({active:true,currentWindow:true}, tabs=>{ if(tabs && tabs[0] && tabs[0].id) chrome.tabs.reload(tabs[0].id) }) }catch(e){}
			})
		}

		// Proxy state button: fetch /api/touch and show status; allow toggle
		const proxyBtn = document.getElementById('proxyState')
		function fetchWithTimeout(url, opts, ms){
			const ctrl = new AbortController()
			const timer = setTimeout(()=> ctrl.abort(), ms)
			return fetch(url, {...opts, signal: ctrl.signal}).finally(()=> clearTimeout(timer))
		}
		async function updateProxyState(){
			if(!proxyBtn) return
			proxyBtn.classList.remove('btn-neutral')
			try{
				if(typeof getServer !== 'function') throw new Error('no getServer')
				const s = await getServer()
				const server = (s.serverUrl || 'http://192.168.1.1:2017').replace(/\/$/,'')
				const token = s.token
				const headers = {'Content-Type':'application/json'}
				if(token) headers['Authorization'] = 'Bearer ' + token
				const r = await fetchWithTimeout(server + '/api/touch', {method:'GET', headers}, 4000)
				if(!r.ok) throw new Error(r.status)
				const resp = await r.json()
				if(!resp || resp.code !== 'SUCCESS' || !resp.data) throw new Error('no data')
				const running = !!resp.data.running
				const touch = resp.data.touch || {}
				const connected = (touch.connectedServers && touch.connectedServers.length) ? touch.connectedServers.length : (touch.connectedServer ? touch.connectedServer.length : 0)
				const isWorking = running && connected > 0
				proxyBtn.textContent = isWorking ? t('proxy_working') : t('proxy_ready')
				proxyBtn.dataset.state = running ? 'running' : 'stopped'
				proxyBtn.dataset.label = isWorking ? 'working' : 'ready'
				proxyBtn.classList.remove('state-working','state-ready','state-starting')
				if(isWorking) proxyBtn.classList.add('state-working')
				else proxyBtn.classList.add('state-ready')
			}catch(e){
				proxyBtn.textContent = t('proxy_ready')
				proxyBtn.dataset.state = 'stopped'
				proxyBtn.dataset.label = 'ready'
				proxyBtn.classList.remove('state-working','state-ready','state-starting')
				proxyBtn.classList.add('state-ready')
			}
		}
		if(proxyBtn){ proxyBtn.addEventListener('click', async ()=>{
			// show loader on click
			const prevText = proxyBtn.textContent
			proxyBtn.textContent = '...'
			// keep loader neutral style
			proxyBtn.classList.remove('state-working','state-ready','state-starting')
			proxyBtn.classList.add('btn-neutral')
			proxyBtn.disabled = true
			try{
				const s = await getServer()
				const server = s.serverUrl || 'http://192.168.1.1:2017'
				const token = s.token
				const state = proxyBtn.dataset.state || 'stopped'
				if(state === 'running'){
					// stop
					try{ await callApi(server, token, '/api/v2ray', 'DELETE') }catch(e){ /* ignore */ }
				}else{
					try{ await callApi(server, token, '/api/v2ray', 'POST') }catch(e){ /* ignore */ }
				}
			}catch(e){}
			await updateProxyState()
			// reload active tab so user sees proxy effect immediately
			try{ chrome.tabs.query({active:true,currentWindow:true}, tabs=>{ if(tabs && tabs[0] && tabs[0].id) chrome.tabs.reload(tabs[0].id) }) }catch(e){}
			proxyBtn.disabled = false
		})

			proxyBtn.addEventListener('mouseenter', ()=>{
				const lbl = proxyBtn.dataset.label || 'ready'
				if(lbl === 'working') proxyBtn.textContent = t('proxy_stop')
				else proxyBtn.textContent = t('proxy_start')
			})
			proxyBtn.addEventListener('mouseleave', async ()=>{ await updateProxyState() })
		// initial update
		updateProxyState()
		}

		// --- Per-site proxy switch ---
		const proxySiteToggle = document.getElementById('proxySiteToggle')
		const proxyHint = document.getElementById('proxyHint')

		function sendMsg(msg){
			return new Promise(res=>{ try{ chrome.runtime.sendMessage(msg, r=>res(r)) }catch(e){ res(null) } })
		}

		async function refreshProxyUi(){
			if(!proxySiteToggle) return
			let host = ''
			try{ if(typeof getCurrentTabHost === 'function') host = await getCurrentTabHost() }catch(e){}
			const r = await sendMsg({type:'PROXY_GET_CONFIG'})
			const cfg = (r && r.cfg) || {}
			const list = Array.isArray(cfg.proxy_domains) ? cfg.proxy_domains : []
			const hLow = String(host || '').toLowerCase().replace(/^www\./, '')
			const inList = !!host && list.some(d=>{
				const dd = String(d || '').trim().toLowerCase()
				return dd && (hLow === dd || hLow.endsWith('.' + dd))
			})
			proxySiteToggle.dataset.host = host || ''
			proxySiteToggle.checked = !!inList
			proxySiteToggle.disabled = !host
			if(proxyHint){
				if(!host) proxyHint.textContent = t('proxy_hint_no_host') || ''
				else if(!cfg.proxy_enabled && inList) proxyHint.textContent = t('proxy_hint_disabled') || ''
				else if(inList) proxyHint.textContent = (t('proxy_via') || 'via') + ' ' + cfg.proxy_host + ':' + cfg.proxy_port
				else proxyHint.textContent = ''
			}
		}

		if(proxySiteToggle){
			proxySiteToggle.addEventListener('change', async ()=>{
				const host = proxySiteToggle.dataset.host
				if(!host){ proxySiteToggle.checked = false; return }
				proxySiteToggle.disabled = true
				const r = await sendMsg({type:'PROXY_TOGGLE_DOMAIN', host})
				proxySiteToggle.disabled = false
				const status = document.getElementById('status')
				if(r && r.ok){
					if(status) status.textContent = r.added ? (t('proxy_site_added') || '') : (t('proxy_site_removed') || '')
					try{ chrome.tabs.query({active:true,currentWindow:true}, tabs=>{ if(tabs && tabs[0] && tabs[0].id) chrome.tabs.reload(tabs[0].id) }) }catch(e){}
				} else {
					proxySiteToggle.checked = !proxySiteToggle.checked
				}
				await refreshProxyUi()
			})
		}
		refreshProxyUi()

		// open panel button
		const openPanel = document.getElementById('openPanel')
		if(openPanel){
			openPanel.addEventListener('click', async ()=>{
				try{
					const s = await getServer()
					const url = (s.serverUrl || 'http://192.168.1.1:2017') + '/'
					chrome.tabs.create({url})
				}catch(e){ window.open('http://192.168.1.1:2017/') }
			})
		}
})
