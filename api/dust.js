// Vercel 서버리스 함수: 클라이언트 요청을 받아 공공데이터포털 에어코리아 API를 대리 호출합니다.
export default async function handler(req, res) {
    // 쿼리스트링에서 sido(시도 이름)를 추출하며, 전달되지 않은 경우 기본값으로 '서울'을 사용합니다.
    const sido = req.query.sido || '서울';

    // Vercel 환경변수에서 AIRKOREA_KEY 값을 안전하게 읽어옵니다.
    const apiKey = process.env.AIRKOREA_KEY;

    // 서버 환경변수에 인증키가 설정되어 있지 않은 경우 500 에러를 반환합니다.
    if (!apiKey) {
        return res.status(500).json({
            success: false,
            message: '서버 환경변수(AIRKOREA_KEY)에 인증키가 설정되지 않았습니다. Vercel 환경변수를 확인해주세요.'
        });
    }

    // 에어코리아 시도별 실시간 측정정보 조회 API 엔드포인트 기본 주소입니다.
    const baseUrl = 'https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty';

    // 환경변수의 인코딩 키를 encodeURIComponent로 감싸고, 시도명 등 필수 파라미터를 조합합니다.
    const targetUrl = `${baseUrl}?serviceKey=${encodeURIComponent(apiKey)}&returnType=json&numOfRows=100&pageNo=1&ver=1.3&sidoName=${encodeURIComponent(sido)}`;

    try {
        // 공공데이터포털 에어코리아 API로 비동기 GET 요청을 전송합니다.
        const apiResponse = await fetch(targetUrl);

        // API로부터 수신한 원본 응답 텍스트를 읽어옵니다.
        const responseText = await apiResponse.text();

        // 응답 본문이 JSON 형태가 아니라 XML 에러 메시지로 시작되는 경우 예외 처리합니다.
        if (responseText.trim().startsWith('<')) {
            return res.status(400).json({
                success: false,
                message: '인증키 또는 요청값을 확인해주세요. (에어코리아 서비스 에러 XML 반환)'
            });
        }

        // 응답 텍스트를 JSON 객체로 파싱합니다.
        let jsonData;
        try {
            jsonData = JSON.parse(responseText);
        } catch (e) {
            return res.status(500).json({
                success: false,
                message: '에어코리아 응답을 JSON으로 변환할 수 없습니다.'
            });
        }

        // 공공데이터 응답 헤더의 resultCode를 확인합니다. ('00'이 정상 성공 코드입니다)
        const header = jsonData?.response?.header;
        if (header && header.resultCode !== '00') {
            return res.status(400).json({
                success: false,
                message: `공공데이터 API 오류가 발생했습니다: [${header.resultCode}] ${header.resultMsg || '알 수 없는 오류'}`
            });
        }

        // 정상 응답 데이터를 클라이언트에 JSON 형태로 그대로 전달합니다.
        return res.status(200).json(jsonData);

    } catch (error) {
        // 서버 내부 통신 오류 발생 시 실패 상태와 오류 원인을 반환합니다.
        return res.status(500).json({
            success: false,
            message: `서버 통신 중 오류가 발생했습니다: ${error.message}`
        });
    }
}

