export default function Slide2() {
  return (
    <div className="w-screen h-screen overflow-hidden relative slide-grid bg-[#FAFBFC] font-body text-primary">
      <div className="relative flex h-full flex-col px-[6vw] py-[5vh]">
        <div className="flex items-center justify-between border-b border-[#DCE5ED] pb-[2vh]"><div className="h-[.65vw] w-[5vw] bg-accent" /><div className="text-[1.35vw] font-bold uppercase tracking-[.16em] text-[#64748B]">01 / КОНТЕКСТ</div></div>
        <div className="grid flex-1 grid-cols-[.9fr_1.1fr] items-center gap-[6vw]">
          <div><div className="mb-[2vh] text-[1.55vw] font-bold uppercase tracking-[.16em] text-accent">FinTrack</div><h1 className="m-0 max-w-[42vw] text-[4.6vw] font-extrabold leading-[1.02] tracking-[-.055em]">Финансы без разрозненных приложений</h1><div className="mt-[4vh] h-[.35vw] w-[9vw] bg-accent" /></div>
          <div className="space-y-[2vh]">
            <div className="slide-card flex items-start gap-[1.5vw] rounded-[1vw] p-[2.1vw]"><div className="slide-number text-[3.5vw] leading-none">01</div><div className="text-[2vw] leading-[1.25]">Данные по счетам и операциям находятся в разных местах</div></div>
            <div className="slide-card flex items-start gap-[1.5vw] rounded-[1vw] p-[2.1vw]"><div className="slide-number text-[3.5vw] leading-none">02</div><div className="text-[2vw] leading-[1.25]">Решения о бюджете требуют единой картины</div></div>
            <div className="slide-card flex items-start gap-[1.5vw] rounded-[1vw] p-[2.1vw]"><div className="slide-number text-[3.5vw] leading-none">03</div><div className="text-[2vw] leading-[1.25]">FinTrack собирает ключевые финансовые сценарии в одном интерфейсе</div></div>
            <div className="slide-card flex items-start gap-[1.5vw] rounded-[1vw] p-[2.1vw]"><div className="slide-number text-[3.5vw] leading-none">04</div><div className="text-[2vw] leading-[1.25]">Продукт ориентирован на российский рынок</div></div>
          </div>
        </div>
      </div>
    </div>
  );
}
