import { useAuth } from "./AuthContext";

export default function AccessDenied() {
    const { user, logOut } = useAuth();

    return (
        <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-4">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-red-600/10 rounded-full blur-3xl" />
            </div>
            <div className="relative z-10 w-full max-w-sm flex flex-col items-center gap-6 text-center">
                <img src="/icon-192x192.png" alt="WorshipFlow" className="w-20 h-20 rounded-3xl shadow-xl opacity-60" />
                <div>
                    <h1 className="text-2xl font-bold text-white">Access Denied</h1>
                    <p className="text-gray-400 mt-2 text-sm">
                        Your account (<span className="text-indigo-400">{user?.email}</span>) is not approved to access WorshipFlow.
                    </p>
                    <p className="text-gray-500 mt-3 text-sm">Please contact your worship team admin to request access.</p>
                </div>
                <button
                    onClick={logOut}
                    className="px-6 py-2.5 bg-gray-800 text-gray-300 rounded-xl hover:bg-gray-700 text-sm font-medium transition-colors"
                >
                    Sign out
                </button>
            </div>
        </div>
    );
}
