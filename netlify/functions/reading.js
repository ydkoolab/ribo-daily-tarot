exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    console.log('API KEY exists:', !!apiKey);
    console.log('API KEY prefix:', apiKey ? apiKey.substring(0, 20) + '...' : 'MISSING');

    const { question, subject, spread, positions, cards } = JSON.parse(event.body);

    // ── 카드 설명 (position 포함) ──
    const cardDesc = cards.map((c, i) => {
      const pos = c.position || (positions && positions[i]) || `카드 ${i + 1}`;
      return `${pos}: ${c.kr} (${c.reversed ? '역방향' : '정방향'})`;
    }).join('\n');

    // ── 대상 설정 ──
    const isSelf = !subject || subject === '본인';
    const subjectName = isSelf ? null : subject.trim();

    // 호칭 처리: "김영삼" → "김영삼님", "친구" → "친구"처럼 이름이면 님 붙임
    const isName = subjectName && /^[가-힣]{2,4}$/.test(subjectName);
    const subjectHonor = subjectName
      ? (isName ? `${subjectName}님` : subjectName)
      : null;

    // 대상 지칭어: 본인이면 "당신", 타인이면 "김영삼님" 또는 입력값
    const personRef   = isSelf ? '당신' : subjectHonor;
    // 소유격: "당신의" / "김영삼님의"
    const personPoss  = `${personRef}의`;
    // 주격 조사: "당신은" / "김영삼님은"
    const personSubj  = `${personRef}은(는)`;

    const subjectNote = isSelf
      ? ''
      : `\n해석 대상: ${subjectHonor}에 관한 상황입니다. 해석 전반에서 "${subjectHonor}"을 주어로 사용하고, "당신"이라는 표현은 절대 쓰지 마세요.`;

    // ── 스프레드별 해석 가이드 ──
    const spreadGuideMap = {
      one:    '한 장의 카드가 전하는 핵심 메시지를 중심으로 답변하세요.',
      three:  '과거·현재·미래의 흐름을 자연스럽게 연결하여 이야기해주세요.',
      choice: 'A안과 B안 각각의 현재 상황과 결과를 비교하고, 어떤 선택이 더 나은지 명확하게 말해주세요.',
      celtic: '10장의 카드가 각 위치에서 전하는 의미를 종합하여 깊이 있게 해석해주세요.',
    };
    const spreadGuide = spreadGuideMap[spread] || '카드들의 흐름을 종합하여 답변하세요.';

    // ── 시스템 프롬프트 ──
    const spreadLabelMap = {
      one:    '원 카드',
      three:  '3카드 (과거·현재·미래)',
      choice: '양자택일',
      celtic: '켈틱 크로스',
    };
    const spreadLabel = spreadLabelMap[spread] || spread || '타로';

    const systemPrompt = isSelf
      ? `당신은 수십 년의 경험을 가진 타로 마스터입니다.
웨이트-라이더 타로 전통에 따라 카드를 해석하며, 역방향 카드는 해당 카드의 에너지가 막히거나 내면으로 향한다는 의미입니다.
카드의 조합과 흐름을 읽어 질문에 대한 구체적이고 통찰력 있는 해석을 제공하세요.
해석 대상은 질문자 본인이며, "당신"을 주어로 사용하세요.
한국어로 따뜻하고 진지하게, 마크다운 없이 자연스러운 문장으로만 작성하세요.`
      : `당신은 수십 년의 경험을 가진 타로 마스터입니다.
웨이트-라이더 타로 전통에 따라 카드를 해석하며, 역방향 카드는 해당 카드의 에너지가 막히거나 내면으로 향한다는 의미입니다.
카드의 조합과 흐름을 읽어 질문에 대한 구체적이고 통찰력 있는 해석을 제공하세요.
해석 대상은 "${subjectHonor}"이며, 반드시 "${subjectHonor}"을 주어로 사용하세요.
"당신", "당신은", "당신의" 같은 표현은 절대 사용하지 말고, 반드시 "${subjectHonor}은(는)", "${subjectHonor}의" 형태로 작성하세요.
한국어로 따뜻하고 진지하게, 마크다운 없이 자연스러운 문장으로만 작성하세요.`;

    // ── 유저 프롬프트 ──
    const prompt = question
      ? `스프레드: ${spreadLabel}${subjectNote}
질문: "${question}"

뽑힌 카드:
${cardDesc}

${spreadGuide}
카드 설명을 단순 나열하지 말고, 질문에 대한 답변 형식으로 자연스럽게 이야기해주세요.
따뜻하고 생동감 있게 한국어로 답변하세요. 마크다운 없이 자연스러운 문장으로만 작성하세요.

아래 형식을 반드시 지켜주세요:
[요약] ${personPoss} 상황을 한 문장(30자 내외)으로 먼저 작성하세요.
[본문] 400자 내외의 상세 해석을 작성하세요.`
      : `스프레드: ${spreadLabel}${subjectNote}

뽑힌 카드:
${cardDesc}

${spreadGuide}
카드들이 전하는 전반적인 에너지와 조언을 구체적이고 생생하게 이야기해주세요.
따뜻하고 생동감 있게 한국어로 답변하세요. 마크다운 없이 자연스러운 문장으로만 작성하세요.

아래 형식을 반드시 지켜주세요:
[요약] ${personPoss} 상황을 한 문장(30자 내외)으로 먼저 작성하세요.
[본문] 400자 내외의 상세 해석을 작성하세요.`;

    console.log('Calling Anthropic API... spread:', spread);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    console.log('Anthropic response status:', response.status);

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.log('Anthropic error:', JSON.stringify(err));
      throw new Error(err?.error?.message || `API 오류 ${response.status}`);
    }

    const data = await response.json();
    const raw = data.content?.[0]?.text || '';

    // ── [요약] / [본문] 파싱 ──
    const summaryMatch = raw.match(/\[요약\]\s*([\s\S]*?)(?=\[본문\]|$)/);
    const bodyMatch    = raw.match(/\[본문\]\s*([\s\S]*)/);

    const summary = summaryMatch ? summaryMatch[1].trim() : '';
    const text    = bodyMatch    ? bodyMatch[1].trim()    : raw.trim();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ summary, text }),
    };

  } catch (e) {
    console.log('ERROR:', e.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: e.message }),
    };
  }
};
