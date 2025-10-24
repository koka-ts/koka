import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
    plugins: [
        react({
            useAtYourOwnRisk_mutateSwcOptions: (options) => {
                options.jsc = {
                    ...options.jsc,
                    parser: {
                        ...(options.jsc?.parser ?? {}),
                        syntax: options.jsc?.parser?.syntax ?? 'typescript',
                        decorators: true,
                    },
                    transform: {
                        ...(options.jsc?.transform ?? {}),
                        decoratorVersion: '2022-03',
                    },
                }
            },
        }),
        tailwindcss(),
    ],
})
