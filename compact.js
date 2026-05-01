// Pure helpers for compacting RoutingA configs.
//
// Compaction targets blocks delimited by markers that the extension itself
// emits when adding host-specific rules:
//
//     # domain: chatgpt.com
//     domain(chatgpt.com)->proxy
//     domain(chat.openai.com)->proxy
//     # end domain: chatgpt.com
//
// becomes a single line per action with markers removed:
//
//     domain(chatgpt.com, chat.openai.com)->proxy
//
// Lines outside such blocks are left untouched. Inside a block, only simple
// `domain(d1,d2,...)->action` rules with bare domains (no `geosite:`,
// `domain:`, `full:`, `regexp:` prefixes) are merged. Anything else stays in
// place at the block's position, before the compacted line.

const SIMPLE_DOMAIN_RE = /^\s*domain\(([\s\S]*?)\)\s*->\s*([A-Za-z0-9_]+)\s*$/
const START_MARKER_RE = /^\s*#\s*domain\s*:\s*(\S+)\s*$/i

function endMarkerReFor(host){
  const esc = host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp('^\\s*#\\s*end\\s+domain\\s*:\\s*' + esc + '\\s*$', 'i')
}

// Walk `# domain: X` blocks. Returns an array of segments:
//   { kind: 'raw', lines: string[] }
//   { kind: 'block', host: string, lines: string[] }   // lines = inner lines only
function splitBlocks(text){
  const rawLines = text.split('\n')
  const segments = []
  let bufRaw = []
  let i = 0
  while(i < rawLines.length){
    const m = rawLines[i].match(START_MARKER_RE)
    if(!m){
      bufRaw.push(rawLines[i])
      i++
      continue
    }
    const host = m[1]
    const endRe = endMarkerReFor(host)
    let j = i + 1
    while(j < rawLines.length && !endRe.test(rawLines[j])) j++
    if(j >= rawLines.length){
      // no matching end marker — treat as raw
      bufRaw.push(rawLines[i])
      i++
      continue
    }
    if(bufRaw.length){ segments.push({kind:'raw', lines: bufRaw}); bufRaw = [] }
    segments.push({kind:'block', host, lines: rawLines.slice(i+1, j)})
    i = j + 1
  }
  if(bufRaw.length) segments.push({kind:'raw', lines: bufRaw})
  return segments
}

// Compact one block's inner lines. Returns { lines: string[], rulesIn, perAction }.
function compactBlockLines(innerLines){
  const groups = new Map()
  const passthrough = []
  let rulesIn = 0
  for(const ln of innerLines){
    const trimmed = ln.trim()
    if(trimmed === '' || trimmed.startsWith('#')){ passthrough.push(ln); continue }
    const m = ln.match(SIMPLE_DOMAIN_RE)
    if(!m){ passthrough.push(ln); continue }
    const domains = m[1].split(',').map(s=>s.trim().toLowerCase()).filter(Boolean)
    if(domains.length === 0 || domains.some(d => d.includes(':'))){
      passthrough.push(ln); continue
    }
    rulesIn++
    const action = m[2]
    if(!groups.has(action)) groups.set(action, {seen:new Set(), list:[]})
    const g = groups.get(action)
    for(const d of domains){
      if(!g.seen.has(d)){ g.seen.add(d); g.list.push(d) }
    }
  }
  const actions = Array.from(groups.keys()).sort()
  const compacted = actions.map(a => `domain(${groups.get(a).list.join(', ')})->${a}`)
  const perAction = {}
  for(const a of actions) perAction[a] = groups.get(a).list.length
  // emit non-rule passthrough first (comments etc), then compacted rules
  return { lines: passthrough.concat(compacted), rulesIn, perAction }
}

function compactRouting(input){
  const text = input == null ? '' : String(input)
  const segments = splitBlocks(text)
  const outLines = []
  let originalRules = 0
  let compactedLines = 0
  let blocksProcessed = 0
  const totalPerAction = {}

  for(const seg of segments){
    if(seg.kind === 'raw'){
      for(const l of seg.lines) outLines.push(l)
      continue
    }
    const r = compactBlockLines(seg.lines)
    blocksProcessed++
    originalRules += r.rulesIn
    for(const a of Object.keys(r.perAction)){
      totalPerAction[a] = (totalPerAction[a] || 0) + r.perAction[a]
    }
    // count only the synthesized compacted rule lines (not passthrough)
    compactedLines += Object.keys(r.perAction).length
    for(const l of r.lines) outLines.push(l)
  }

  const out = outLines.join('\n')
  const norm = s => s.replace(/\r/g,'').replace(/\s+$/,'')
  return {
    text: out,
    changed: norm(out) !== norm(text),
    stats: {
      originalRules,
      compactedLines,
      blocksProcessed,
      perAction: totalPerAction
    }
  }
}

if(typeof window !== 'undefined'){
  window.compactRouting = compactRouting
  window.splitBlocks = splitBlocks
}
if(typeof module !== 'undefined' && module.exports){
  module.exports = { compactRouting, splitBlocks }
}
