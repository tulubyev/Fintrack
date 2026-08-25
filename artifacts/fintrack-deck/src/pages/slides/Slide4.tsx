export default function Slide4() {
  return (
    <div className="w-screen h-screen overflow-hidden relative slide-grid bg-[#FAFBFC] font-body text-primary">
      <div className="relative flex h-full flex-col px-[6vw] py-[5vh]">
        <div className="flex items-center justify-between border-b border-[#DCE5ED] pb-[2vh]"><div className="text-[1.25vw] font-bold uppercase tracking-[.14em]">FinTrack</div><div className="text-[1.35vw] font-bold uppercase tracking-[.16em] text-[#64748B]">03 / СЦЕНАРИЙ</div></div>
        <div className="pt-[4vh]"><div className="mb-[1.5vh] text-[1.55vw] font-bold uppercase tracking-[.16em] text-accent">Пользовательский путь</div><h1 className="m-0 text-[4.5vw] font-extrabold leading-[1.02] tracking-[-.055em]">Путь пользователя</h1></div>
        <div className="relative mt-[9vh] flex flex-1 items-start justify-between">
          <div className="absolute left-[5vw] right-[5vw] top-[3vw] h-[.25vw] bg-[#CFE4E3]" />
          <div className="relative z-10 flex w-[16vw] flex-col items-center text-center"><div className="slide-ring flex h-[6vw] w-[6vw] items-center justify-center rounded-full bg-[#FAFBFC] text-[2.2vw] font-extrabold text-accent">01</div><div className="mt-[2vh] text-[1.85vw] font-bold leading-[1.18]">Регистрация по email или телефону</div></div>
          <div className="relative z-10 flex w-[16vw] flex-col items-center text-center"><div className="slide-ring flex h-[6vw] w-[6vw] items-center justify-center rounded-full bg-[#FAFBFC] text-[2.2vw] font-extrabold text-accent">02</div><div className="mt-[2vh] text-[1.85vw] font-bold leading-[1.18]">Вход по паролю и дополнительная проверка при необходимости</div></div>
          <div className="relative z-10 flex w-[16vw] flex-col items-center text-center"><div className="slide-ring flex h-[6vw] w-[6vw] items-center justify-center rounded-full bg-[#FAFBFC] text-[2.2vw] font-extrabold text-accent">03</div><div className="mt-[2vh] text-[1.85vw] font-bold leading-[1.18]">Подключение банковских источников</div></div>
          <div className="relative z-10 flex w-[16vw] flex-col items-center text-center"><div className="slide-ring flex h-[6vw] w-[6vw] items-center justify-center rounded-full bg-[#FAFBFC] text-[2.2vw] font-extrabold text-accent">04</div><div className="mt-[2vh] text-[1.85vw] font-bold leading-[1.18]">Просмотр общей картины на дашборде</div></div>
          <div className="relative z-10 flex w-[16vw] flex-col items-center text-center"><div className="slide-ring flex h-[6vw] w-[6vw] items-center justify-center rounded-full bg-[#FAFBFC] text-[2.2vw] font-extrabold text-accent">05</div><div className="mt-[2vh] text-[1.85vw] font-bold leading-[1.18]">Управление бюджетами, накоплениями и активами</div></div>
        </div>
      </div>
    </div>
  );
}
