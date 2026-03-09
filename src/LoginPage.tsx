import { useAuth } from "./AuthContext";

export default function LoginPage() {
    const { signInWithGoogle } = useAuth();

    return (
        <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-4">
            {/* Background glow */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-3xl" />
            </div>

            <div className="relative z-10 w-full max-w-sm flex flex-col items-center gap-8">
                {/* Logo */}
                <div className="flex flex-col items-center gap-4">
                    <img
                        src="/icon-192x192.png"
                        alt="WorshipFlow"
                        className="w-24 h-24"
                    />
                    <div className="text-center">
                        <h1 className="text-3xl font-bold text-white tracking-tight">WorshipFlow</h1>
                        <p className="text-sm text-gray-400 mt-1">Worship Team Management</p>
                    </div>
                </div>

                {/* Card */}
                <div className="w-full bg-gray-900/80 backdrop-blur border border-gray-800 rounded-2xl p-8 flex flex-col gap-6 shadow-2xl">
                    <div className="text-center">
                        <h2 className="text-lg font-semibold text-white">Welcome back</h2>
                        <p className="text-sm text-gray-400 mt-1">Sign in to access your team's workspace</p>
                    </div>

                    <button
                        onClick={signInWithGoogle}
                        className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white text-gray-900 font-semibold rounded-xl hover:bg-gray-100 active:scale-95 transition-all duration-150 shadow-md"
                    >
                        {/* Google Icon */}
                        <svg className="w-5 h-5" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                        </svg>
                        Continue with Google
                    </button>

                    <p className="text-xs text-gray-500 text-center">
                        Access is restricted to approved team members only.
                    </p>
                </div>

                <p className="text-xs text-gray-600">ICLC Worship Team &copy; {new Date().getFullYear()}</p>
            </div>
        </div>
    );
}
