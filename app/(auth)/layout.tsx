export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-muted/40 px-4 py-12">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <div className="flex items-center justify-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-2xl bg-primary text-sm font-semibold text-primary-foreground">
            RO
          </div>
          <span className="font-heading text-base font-medium text-foreground">
            Rental Office
          </span>
        </div>
        {children}
      </div>
    </div>
  )
}
