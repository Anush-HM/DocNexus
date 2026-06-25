// backend/services/ragService.js
// ─────────────────────────────────────────────
//  RAG Chatbot pipeline:
//  User Question → Retriever → Relevant Chunks
//    → Prompt Construction → OpenAI Chat API → Answer
// ─────────────────────────────────────────────

const { getChatModel } = require('./llmService');
const { retrieveRelevantChunks, retrieveRelevantQPChunks } = require('./vectorSearchService');

/**
 * Answer a user's question using only the project's fused knowledge base.
 * @param {string} projectId
 * @param {string} question
 * @param {boolean} includeQP - also search question-paper chunks (exam-focused questions)
 */
async function answerQuestion(projectId, question, includeQP = false) {
  const chunks = await retrieveRelevantChunks(projectId, question, 5);
  const qpChunks = includeQP ? await retrieveRelevantQPChunks(projectId, question, 3) : [];

  if (chunks.length === 0 && qpChunks.length === 0) {
    return {
      answer: "I couldn't find anything relevant to that in your fused knowledge base yet. Try rephrasing, or check that your documents finished processing.",
      sources: [],
    };
  }

  const contextBlocks = chunks
    .map((c) => `[${c.sourceFileName}${c.pageNumber ? ` p.${c.pageNumber}` : ''}]\n${c.text}`)
    .join('\n\n');

  const qpContextBlocks = qpChunks
    .map((c) => `[Question Paper: ${c.sourceFileName}]\n${c.text}`)
    .join('\n\n');

  const prompt = `You are DocNexus's study assistant. Answer the user's question using ONLY the context below, which comes from their own uploaded study materials. If the context doesn't contain the answer, say so honestly — do not make things up.

Keep answers clear and exam-relevant. Use short paragraphs or bullet points where helpful.

KNOWLEDGE BASE CONTEXT:
${contextBlocks || '(no relevant notes found)'}

${includeQP ? `PREVIOUS-YEAR QUESTION PAPER CONTEXT:\n${qpContextBlocks || '(no relevant question paper excerpts found)'}\n` : ''}

QUESTION: ${question}

Answer:`;

  const model = getChatModel();
  const response = await model.invoke(prompt);
  const answer = typeof response.content === 'string' ? response.content : String(response.content);

  const sources = [
    ...new Set(
      chunks.map((c) => `${c.sourceFileName}${c.pageNumber ? ` p.${c.pageNumber}` : ''}`)
    ),
  ];

  return { answer, sources };
}

module.exports = { answerQuestion };