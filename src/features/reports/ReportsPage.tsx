export default function ReportPage() {
  return (
    <section>
      <h2>보고서</h2>
      <button onClick={() => console.log('보고서 생성 요청')}>PDF 생성</button>
    </section>
  );
}