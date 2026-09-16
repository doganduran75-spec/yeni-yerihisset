// pm2 CLUSTER modu — Next.js'i tek çekirdek yerine TÜM CPU çekirdeklerine yayar.
// pm2, next binary'sini cluster modda fork eder; Node cluster modülü 3000 portunu
// worker'lar arasında paylaştırır. Böylece eşzamanlı istekler paralel işlenir →
// yük altında gecikme düşer, kapasite artar.
//
// Kurulum (bir kez, eski tek-instance süreçten geçiş):
//   cd /opt/yerihisset-app
//   pm2 delete yerihisset
//   pm2 start ecosystem.config.js
//   pm2 save
// Sonraki dağıtımlarda scripts/deploy.sh bunu otomatik kullanır.

module.exports = {
  apps: [
    {
      name: "yerihisset",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      cwd: "/opt/yerihisset-app",
      instances: "max",        // tüm çekirdekler; sabit sayı istersen 2/3/4 yaz
      exec_mode: "cluster",
      autorestart: true,
      max_memory_restart: "1G", // bir instance 1G'yi aşarsa yeniden başlat
      env: {
        NODE_ENV: "production",
        PORT: "3000",
      },
    },
  ],
};
