/** @type {import('next').NextConfig} */
const nextConfig = {
  // Autorise l'accès au serveur de dev depuis un téléphone du même réseau local (IP privées)
  allowedDevOrigins: ['192.168.*.*', '10.*.*.*', '172.*.*.*'],
  // Masque la pastille « N » de Next en dev (elle recouvre la barre du bas sur téléphone)
  devIndicators: false,
};
export default nextConfig;
