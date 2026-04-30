export function Hero() {
  return (
    <div className="flex flex-col gap-16 items-center">
      <div className="flex flex-col gap-4 items-center">
        <h1 className="text-4xl lg:text-6xl font-bold tracking-tight text-center">
          ScreenBased
        </h1>
        <p className="text-lg text-muted-foreground font-medium">
          CSAP Queue Management System
        </p>
      </div>
      <p className="text-3xl lg:text-4xl !leading-tight mx-auto max-w-2xl text-center">
        A digital queue and reservation system for schools and offices. Reserve
        a slot, monitor your position on screen, and get served faster no more
        long physical lines.
      </p>
      <p className="text-xl text-muted-foreground italic max-w-xl text-center">
        Smart Queues, Zero Lines.
      </p>
      <div className="w-full p-[1px] bg-gradient-to-r from-transparent via-foreground/10 to-transparent my-8" />
    </div>
  );
}
