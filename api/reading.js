export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const { question, subject, spread, positions, cards } = req.body;

    const cardDesc = cards.map((c, i) => {
      const pos = c.position || (positions && positions[i]) || `카드 ${i + 1}`;
      return `${pos}: ${c.kr} (${c.reversed ? '역방향' : '정방향'})`;
    }).join('\n');

    const isSelf = !subject || subject === '본인';
    const subjectName = isSelf ? null : subject.trim();
    const isName = subjectName && /^[가-힣]{2,4}$/.test(subjectName);
    const subjectHonor = subjectName ? (isName ? `${subjectName}님` : subjectName) : null;
    const personRef  = isSelf ? '당신' : subjectHonor;
    const personPoss = `${personRef}의`;

    const subjectNote = isSelf
      ? ''
      : `\n해석 대상: ${subjectHonor}에 관한 상황입니다. 해석 전반에서 "${subjectHonor}"을 주어로 사용하고, "당신"이라는 표현은 절대 쓰지 마세요.`;

    const spreadGuideMap = {
      one:    '한 장의 카드가 전하는 핵심 메시지를 중심으로 답변하세요.',
      three:  '과거·현재·미래의 흐름을 자연스럽게 연결하여 이야기해주세요.',
      choice: 'A안과 B안 각각의 현재 상황과 결과를 비교하고, 어떤 선택이 더 나은지 명확하게 말해주세요.',
      celtic: '10장의 카드가 각 위치에서 전하는 의미를 종합하여 깊이 있게 해석해주세요.',
    };
    const spreadLabelMap = {
      one: '원 카드', three: '3카드 (과거·현재·미래)',
      choice: '양자택일', celtic: '켈틱 크로스',
    };

    const systemPrompt = isSelf
      ? `당신은 수십 년의 경험을 가진 타로 마스터입니다. 웨이트-라이더 타로 전통에 따라 카드를 해석하며, 역방향 카드는 해당 카드의 에너지가 막히거나 내면으로 향한다는 의미입니다. 해석 대상은 질문자 본인이며, "당신"을 주어로 사용하세요. 한국어로 따뜻하고 진지하게, 마크다운 없이 자연스러운 문장으로만 작성하세요.`
      : `당신은 수십 년의 경험을 가진 타로 마스터입니다. 웨이트-라이더 타로 전통에 따라 카드를 해석합니다. 해석 대상은 "${subjectHonor}"이며, 반드시 "${subjectHonor}"을 주어로 사용하세요. "당신" 표현은 절대 사용하지 마세요. 한국어로 따뜻하고 진지하게, 마크다운 없이 자연스러운 문장으로만 작성하세요.`;

    const prompt = `스프레드: ${spreadLabelMap[spread] || spread}${subjectNote}
${question ? `질문: "${question}"\n` : ''}
뽑힌 카드:
${cardDesc}

${spreadGuideMap[spread] || ''}
아래 형식을 반드시 지켜주세요:
[요약] ${personPoss} 상황을 한 문장(30자 내외)으로 먼저 작성하세요.
[본문] 400자 내외의 상세 해석을 작성하세요.`;

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

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.error?.message || `API 오류 ${response.status}`);
    }

    const data = await response.json();
    const raw = data.content?.[0]?.text || '';

    const summaryMatch = raw.match(/\[요약\]\s*([\s\S]*?)(?=\[본문\]|$)/);
    const bodyMatch    = raw.match(/\[본문\]\s*([\s\S]*)/);
    const summary = summaryMatch ? summaryMatch[1].trim() : '';
    const text    = bodyMatch    ? bodyMatch[1].trim()    : raw.trim();

    return res.status(200).json({ summary, text });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
