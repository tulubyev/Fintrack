export default function Slide12() {
  return (
    <div className="w-screen h-screen overflow-hidden relative slide-grid bg-[#FAFBFC] font-body text-primary">
      <div className="relative flex h-full flex-col px-[6vw] py-[5vh]">
        <div className="flex items-center justify-between border-b border-[#DCE5ED] pb-[2vh]"><div className="text-[1.25vw] font-bold uppercase tracking-[.14em]">FinTrack</div><div className="text-[1.35vw] font-bold uppercase tracking-[.16em] text-[#64748B]">11 / DATA LAYER</div></div>
        <div className="grid flex-1 grid-cols-[.78fr_1.22fr] items-center gap-[5vw]">
          <div><div className="mb-[2vh] text-[1.55vw] font-bold uppercase tracking-[.16em] text-accent">Проверенная база</div><h1 className="m-0 text-[4.8vw] font-extrabold leading-[1.02] tracking-[-.06em]">Данные после миграции</h1><div className="mt-[4vh] flex items-end gap-[1vw]"><div className="text-[8vw] font-extrabold leading-none tracking-[-.08em] text-accent">19</div><div className="pb-[1vh] text-[1.8vw] font-bold leading-tight">таблиц<br />в проверенной базе</div></div><div className="mt-[3vh] text-[1.8vw] text-[#64748B]">13 пользователей</div></div>
          <div className="space-y-[1.2vw]"><div className="slide-card rounded-[.9vw] p-[1.8vw] text-[1.95vw] leading-[1.2]">Рабочая база переведена на выделенный PostgreSQL VPS</div><div className="slide-card rounded-[.9vw] p-[1.8vw] text-[1.95vw] leading-[1.2]">Проверка подключения подтверждает пользователя базы tulubyev и базу fintrack_db</div><div className="slide-card rounded-[.9vw] p-[1.8vw] text-[1.95vw] leading-[1.2]">Приложение обращается к базе через DATABASE_URL</div><div className="slide-card-soft rounded-[.9vw] p-[1.8vw] text-[1.95vw] font-bold leading-[1.2]">Секреты не хранятся в репозитории</div></div>
        </div>
      </div>
    </div>
  );
}
