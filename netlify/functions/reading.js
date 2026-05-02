exports.handler = async function(event) {

  // CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  // Preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const { question, cards } = JSON.parse(event.body);

    const POSITIONS = ['과거', '현재', '미래'];
    const cardDesc = cards.map((c, i) =>
      `${POSITIONS[i]}: ${c.kr} (${c.reversed ? '역방향' : '정방향'})`
    ).join('\n');

    const prompt = question
      ? `질문: "${question}"\n\n뽑힌 카드:\n${cardDesc}\n\n위 카드들을 종합하여 "${question}"에 대한 답을 직접적으로 해주세요. 카드 설명을 나열하지 말고, 질문에 대한 답변 형식으로 자연스럽게 이야기해주세요. 따뜻하고 생동감 있게, 400자 내외로 한국어로 답변하세요. 마크다운 없이 자연스러운 문장으로만 작성하세요.`
      : `뽑힌 카드:\n${cardDesc}\n\n카드들이 전하는 오늘의 전반적인 에너지와 조언을 구체적이고 생생하게 이야기해주세요. 따뜻하고 생동감 있게, 400자 내외로 한국어로 답변하세요. 마크다운 없이 자연스러운 문장으로만 작성하세요.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        system: `당신은 수십 년의 경험을 가진 타로 마스터입니다.
웨이트-라이더 타로 전통에 따라 카드를 해석하며, 과거-현재-미래의 3카드 스프레드를 사용합니다.
역방향 카드는 해당 카드의 에너지가 막히거나 내면으로 향한다는 의미입니다.
카드의 조합과 흐름을 읽어 질문에 대한 구체적이고 통찰력 있는 해석을 제공하세요.
반드시 질문의 맥락에 맞게 답하세요.
한국어로 따뜻하고 진지하게, 마크다운 없이 자연스러운 문장으로만 작성하세요.`,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.error?.message || `API 오류 ${response.status}`);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ text }),
    };

  } catch (e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: e.message }),
    };
  }
};
