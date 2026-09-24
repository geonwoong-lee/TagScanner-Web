// 파일럿 테스트 설정값
// 여기 있는 값은 브라우저에 그대로 노출되는 공개 값이다.
// 비밀 값(service_role 키, 구글 API 키)은 절대 이 파일에 넣지 않는다. 서버(Edge Function)에 둔다.
window.APP_CONFIG = {
  // Supabase 프로젝트 (로그인, 동기화, 사용 로그)
  supabaseUrl: 'https://vvuxqnjeawujkbudhxhy.supabase.co',
  supabaseAnonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ2dXhxbmplYXd1amtidWRoeGh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAyMTUxMTcsImV4cCI6MjEwNTc5MTExN30.VQE1VvuCVYzyS9nD52xk-l5yb-rZ-6qo3eMEVn3vhwo',

  // Google Analytics 4 측정 ID (G-로 시작). 비워 두면 GA 전송을 건너뛴다.
  gaMeasurementId: 'G-Q19Q7TEWGL',

  // 파일럿 기간에만 로그인을 요구한다. false면 예전처럼 로그인 없이 쓸 수 있다.
  pilotMode: true,
};
