export default function SearchLoading() {
  return (
    <div className="mx-auto max-w-[1440px] px-5 pb-24 pt-10 sm:px-8">
      <div className="mb-10 border-b border-[var(--color-line)] pb-8">
        <div className="skeleton h-11 max-w-xl rounded-2xl" />
        <div className="skeleton mt-6 h-10 w-2/3 max-w-md" />
      </div>
      <div className="mb-8 flex gap-2">
        {[80, 90, 90].map((w, i) => (
          <div key={i} className="skeleton h-8 rounded-full" style={{ width: w }} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i}>
            <div className="skeleton aspect-[2/3]" />
            <div className="skeleton mt-2.5 h-3.5 w-3/4" />
          </div>
        ))}
      </div>
    </div>
  );
}
