export default function Slide14() {
  return (
    <div className="w-screen h-screen overflow-hidden relative slide-grid bg-[#FAFBFC] font-body text-primary">
      <div className="relative flex h-full flex-col px-[6vw] py-[5vh]">
        <div className="flex items-center justify-between border-b border-[#DCE5ED] pb-[2vh]"><div className="text-[1.25vw] font-bold uppercase tracking-[.14em]">FinTrack</div><div className="text-[1.35vw] font-bold uppercase tracking-[.16em] text-[#64748B]">13 / SECURITY</div></div>
        <div className="pt-[4vh]"><div className="mb-[1.5vh] text-[1.55vw] font-bold uppercase tracking-[.16em] text-accent">Контроль доступа и готовность</div><h1 className="m-0 text-[4.5vw] font-extrabold leading-[1.02] tracking-[-.055em]">Безопасность и эксплуатация</h1></div>
        <div className="mt-[5vh] grid flex-1 grid-cols-[1.1fr_.9fr] gap-[2vw]">
          <div className="slide-card rounded-[1.2vw] p-[2.5vw]"><div className="grid grid-cols-2 gap-[1.2vw]"><div className="rounded-[.8vw] bg-[#F1F7F7] p-[1.5vw]"><div className="mb-[2vh] h-[2.5vw] w-[2.5vw] rounded-full bg-accent" /><div className="text-[1.8vw] leading-[1.2]">Секреты передаются через окружение, а не через файлы проекта</div></div><div className="rounded-[.8vw] bg-[#F1F7F7] p-[1.5vw]"><div className="mb-[2vh] h-[2.5vw] w-[2.5vw] rounded-full bg-[#1E3A5F]" /><div className="text-[1.8vw] leading-[1.2]">Вход защищён JWT, rate limiting и дополнительной проверкой</div></div><div className="rounded-[.8vw] bg-[#F1F7F7] p-[1.5vw]"><div className="mb-[2vh] h-[2.5vw] w-[2.5vw] rounded-full bg-accent" /><div className="text-[1.8vw] leading-[1.2]">PostgreSQL доступен через ограниченный список IP</div></div><div className="rounded-[.8vw] bg-[#F1F7F7] p-[1.5vw]"><div className="mb-[2vh] h-[2.5vw] w-[2.5vw] rounded-full bg-[#1E3A5F]" /><div className="text-[1.8vw] leading-[1.2]">Для production нужен постоянный защищённый сетевой маршрут к БД</div></div></div></div>
          <div className="rounded-[1.2vw] bg-[#1E3A5F] p-[2.5vw] text-white"><div className="mb-[4vh] text-[1.8vw] font-bold text-[#B9DFDC]">Production boundary</div><div className="flex h-[18vw] items-center justify-center"><div className="slide-ring flex h-[12vw] w-[12vw] items-center justify-center rounded-full border-white/30"><div className="text-center"><div className="text-[3vw] font-extrabold">KEY</div><div className="mt-[1vh] text-[1.5vw] uppercase tracking-[.12em] text-white/65">rotate</div></div></div></div><div className="mt-[3vh] text-[1.85vw] leading-[1.2]">Временный ключ шифрования допустим только для разработки и должен быть заменён перед production</div></div>
        </div>
      </div>
    </div>
  );
}
