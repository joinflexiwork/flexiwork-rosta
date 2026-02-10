export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-violet-600 via-indigo-600 via-[55%] to-blue-500">
      <div className="text-white/90 text-center">
        <div className="w-10 h-10 border-2 border-white/40 border-t-white rounded-full animate-spin mx-auto mb-4" />
        <p className="font-medium">Loading...</p>
      </div>
    </div>
  )
}
