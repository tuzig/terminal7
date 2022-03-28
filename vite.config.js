import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  test: {
      environment: "jsdom",
      reporters: "verbose",
      globals: true,
      exclude: [ ...configDefaults.exclude, "qa/*/*" ],
  },
  plugins: [
    VitePWA({
      strategies: 'injectManifest',
      includeAssets: ['favicon.ico', 'robots.txt', 'apple-touch-icon.png'],  
      manifest: {
        name: 'Terminal7',
        short_name: 'The web-age terminal',
        description: 'A touchable terminal multiplexer & emulator running over WebRTC',
        theme_color: '#271D30',
        icons: [
          {
            src: 'logo192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'logo512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'logo512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          }
        ]
      }
    })
  ]    
})
