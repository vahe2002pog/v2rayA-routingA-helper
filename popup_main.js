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
		async function updateProxyState(){
			if(!proxyBtn) return
			// do not change text while polling; show current or default to READY
			if(!proxyBtn.textContent || proxyBtn.textContent.trim() === '') proxyBtn.textContent = 'Loading...'
			try{
				if(typeof getServer !== 'function' || typeof callApi !== 'function'){
					proxyBtn.textContent = 'Loading...'
					proxyBtn.dataset.state = 'stopped'
					return
				}
				const s = await getServer()
				const server = s.serverUrl || 'http://192.168.1.1:2017'
				const token = s.token
				const resp = await callApi(server, token, '/api/touch', 'GET')
				if(!resp || resp.code !== 'SUCCESS' || !resp.data){ proxyBtn.textContent = 'Loading...'; proxyBtn.dataset.state = 'stopped'; return }
				const running = !!resp.data.running
				const touch = resp.data.touch || {}
				const connected = (touch.connectedServers && touch.connectedServers.length) ? touch.connectedServers.length : (touch.connectedServer ? touch.connectedServer.length : 0)
				// Map to labels (Title Case):
				// running && connected > 0 -> Working
				// running && connected == 0 -> Ready
				// !running -> Ready
				let label = 'Ready'
				if(running && connected > 0) label = 'Working'
				else label = 'Ready'
				proxyBtn.textContent = label
				proxyBtn.dataset.state = running ? 'running' : 'stopped'
				// set colors via classes
				proxyBtn.classList.remove('state-working','state-ready','state-starting')
				if(label === 'Working') proxyBtn.classList.add('state-working')
				else if(label === 'Ready') proxyBtn.classList.add('state-ready')
			}catch(e){ proxyBtn.textContent = 'Loading...'; proxyBtn.dataset.state = 'stopped' }
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

			// hover behavior: show Stop/Start hint (Title Case labels used)
			proxyBtn.addEventListener('mouseenter', ()=>{
				const lbl = (proxyBtn.textContent || '').trim()
				if(lbl === 'Working') proxyBtn.textContent = 'Stop'
				else if(lbl === 'Ready') proxyBtn.textContent = 'Start'
			})
			proxyBtn.addEventListener('mouseleave', async ()=>{ await updateProxyState() })
		// initial update
		updateProxyState()
		}

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
