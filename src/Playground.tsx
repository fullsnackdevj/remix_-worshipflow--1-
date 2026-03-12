import { FlaskConical } from "lucide-react";

export default function Playground() {
  return (
    <div className="max-w-5xl mx-auto select-none">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg">
          <FlaskConical size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Playground</h1>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Admin sandbox — UI experiments and feature prototypes live here.
          </p>
        </div>
      </div>

      {/* Empty state */}
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 rounded-3xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center mb-4">
          <FlaskConical size={32} className="text-violet-500" />
        </div>
        <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">Nothing here yet</h2>
        <p className="text-sm text-gray-400 dark:text-gray-500 max-w-xs">
          This space is reserved for admin-only experiments. New features will be prototyped here before being rolled out.
        </p>
      </div>
    </div>
  );
}
