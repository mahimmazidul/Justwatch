export default function WatchlistLoading() {
  return (
    <div className="mx-auto max-w-[1440px] px-5 pb-24 pt-12 sm:px-8">
      <div className="mb-10 border-b border-[var(--color-line)] pb-8">
        <div className="skeleton h-4 w-32" />
        <div className="skeleton mt-4 h-12 w-72" />
        <div className="skeleton mt-4 h-4 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i}>
            <div className="skeleton aspect-[2/3]" />
            <div className="skeleton mt-2.5 h-3.5 w-3/4" />
          </div>
        ))}
      </div>
    </div>
  );
}
