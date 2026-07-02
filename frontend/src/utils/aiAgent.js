import { callGemini, callGroq } from './aiClient'

// ─── TOOL DEFINITIONS (Gemini Function Declarations) ─────────────────────

const TOOLS = [
  {
    name: 'search_web',
    description: 'Searches the live internet for information. Returns a summary of findings and sources.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'The exact search query to execute.' }
      },
      required: ['query']
    }
  },
  {
    name: 'check_source_credibility',
    description: 'Checks the historical credibility, bias, and reliability of a specific news source or organization.',
    parameters: {
      type: 'OBJECT',
      properties: {
        source_name: { type: 'STRING', description: 'The name of the source or publication to evaluate.' }
      },
      required: ['source_name']
    }
  },
  {
    name: 'analyze_language',
    description: 'Analyzes a text for manipulative, emotional, or biased language patterns.',
    parameters: {
      type: 'OBJECT',
      properties: {
        text: { type: 'STRING', description: 'The text to analyze.' }
      },
      required: ['text']
    }
  },
  {
    name: 'final_verdict',
    description: 'Call this ONLY when you have gathered enough information to make a final conclusion. This ends the investigation.',
    parameters: {
      type: 'OBJECT',
      properties: {
        verdict: { type: 'STRING', description: 'Must be one of: VERIFIED, MISLEADING, UNVERIFIED, DISPUTED' },
        confidence: { type: 'INTEGER', description: 'A number between 0 and 100 representing confidence in the verdict' },
        summary: { type: 'STRING', description: 'Detailed explanation of the verdict.' },
        supporting_sources: { type: 'ARRAY', items: { type: 'STRING' }, description: 'List of sources/evidence supporting the claim.' },
        contradicting_sources: { type: 'ARRAY', items: { type: 'STRING' }, description: 'List of sources/evidence contradicting the claim.' }
      },
      required: ['verdict', 'confidence', 'summary', 'supporting_sources', 'contradicting_sources']
    }
  }
]

// ─── INTERNAL TOOL EXECUTION FUNCTIONS ─────────────────────────────────────

async function executeTool(toolName, args, geminiKey) {
  try {
    if (toolName === 'search_web') {
      const prompt = `Search the web for: "${args.query}". Summarize the most relevant findings and list the sources.`
      // Use grounded gemini call to perform real web search
      const result = await callGemini({ apiKey: geminiKey, prompt, grounded: true })
      return result.text
    }
    
    if (toolName === 'check_source_credibility') {
      const prompt = `Evaluate the credibility, bias, and factual reporting history of this source: "${args.source_name}". Return a brief summary of its reliability.`
      const result = await callGemini({ apiKey: geminiKey, prompt, grounded: false })
      return result.text
    }
    
    if (toolName === 'analyze_language') {
      const prompt = `Analyze this text for manipulative, emotional, misleading, or heavily biased language patterns: "${args.text}". Identify specific flagged phrases.`
      const result = await callGemini({ apiKey: geminiKey, prompt, grounded: false })
      return result.text
    }

    if (toolName === 'final_verdict') {
      return 'Verdict accepted.'
    }

    return `Error: Unknown tool ${toolName}`
  } catch (err) {
    return `Error executing tool: ${err.message}`
  }
}

// ─── CORE AGENT LOOP (Backend Streamed) ────────────────────────────────────────

export async function runDeepDiveAgent({ claim, geminiKey, groqKey, onStepUpdate }) {
  if (!geminiKey && !groqKey) throw new Error('NO_KEY')

  let finalResult = null
  let fullTranscript = `CLAIM: "${claim}"\n\n`

  try {
    const res = await fetch('/api/agent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ai-key': geminiKey || '',
        'x-groq-key': groqKey || ''
      },
      body: JSON.stringify({ claim, geminiKey, groqKey })
    })

    if (!res.ok) {
      throw new Error(`Agent backend error: ${res.status}`)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      
      buffer += decoder.decode(value, { stream: true })
      
      const lines = buffer.split('\n\n')
      buffer = lines.pop() // keep incomplete chunk
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const dataStr = line.replace('data: ', '').trim()
          if (!dataStr) continue
          
          try {
            const parsed = JSON.parse(dataStr)
            
            if (parsed.type === 'thought') {
              fullTranscript += `Agent Thought: ${parsed.text}\n\n`
            } else if (parsed.type === 'tool') {
              onStepUpdate({ tool: parsed.name, args: parsed.args, status: 'active' })
              fullTranscript += `Tool Called: ${parsed.name}\nArguments: ${JSON.stringify(parsed.args)}\n\n`
            } else if (parsed.type === 'observation') {
              onStepUpdate({ tool: 'observation', args: {}, status: 'done' })
              fullTranscript += `Result: ${parsed.text}\n\n`
            } else if (parsed.type === 'final') {
              const resObj = typeof parsed.result === 'string' ? JSON.parse(parsed.result) : parsed.result
              finalResult = {
                verdict: String(resObj.verdict || 'UNVERIFIED').toUpperCase(),
                confidence: Number(resObj.confidence || 50),
                summary: String(resObj.summary || ''),
                supporting_sources: Array.isArray(resObj.supporting_sources) ? resObj.supporting_sources : [],
                contradicting_sources: Array.isArray(resObj.contradicting_sources) ? resObj.contradicting_sources : [],
                flagged_phrases: [],
                analyst_note: '',
                missing_context: ''
              }
              fullTranscript += `Agent concluded with final_verdict.\nVerdict: ${finalResult.verdict}\nSummary: ${finalResult.summary}\n\n`
              onStepUpdate({ tool: 'final_verdict', args: finalResult, status: 'done' })
            } else if (parsed.type === 'error') {
              fullTranscript += `Agent Error: ${parsed.text}\n\n`
            }
          } catch (e) {
            console.error("Failed to parse SSE line:", dataStr, e)
          }
        }
      }
    }
  } catch (err) {
    fullTranscript += `Network/Execution Error: ${err.message}\n`
  }

  // Fallback if loop ended without final_verdict
  if (!finalResult) {
    finalResult = {
      verdict: 'UNVERIFIED',
      confidence: 0,
      summary: 'Agent failed to reach a conclusion within the maximum allowed steps.',
      supporting_sources: [],
      contradicting_sources: [],
      flagged_phrases: [],
      analyst_note: '',
      missing_context: ''
    }
  }

  // ─── SECOND OPINION (Groq) ────────────────────────────────────────────────
  let groqReview = null
  if (groqKey && finalResult.verdict !== 'UNVERIFIED') {
    try {
      const prompt = `You are a senior intelligence analyst performing a "Red Team" review of another agent's investigation.
Read the following transcript of the agent's investigation and its final verdict.
Do you agree with their reasoning and conclusion? Point out any logical flaws, bias, or missed context.

TRANSCRIPT:
${fullTranscript.slice(-15000)}

Return ONLY a JSON object:
{
  "agrees": true or false,
  "feedback": "2-3 sentences of your critical feedback on their process and verdict."
}`
      
      const res = await callGroq({ apiKey: groqKey, prompt, grounded: false })
      let raw = res.text.trim()
      raw = raw.replace(/^```(?:json)?\s*/m, '').replace(/\\s*```$/m, '')
      const match = raw.match(/\{[\s\S]*\}/)
      if (match) {
         groqReview = JSON.parse(match[0])
      } else {
         groqReview = JSON.parse(raw)
      }
    } catch (e) {
      console.error("Groq review failed:", e)
    }
  }

  return { finalResult, groqReview, fullTranscript }
}
