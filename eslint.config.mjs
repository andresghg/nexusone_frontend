import nextConfig from 'eslint-config-next'

// Reglas nuevas de eslint-plugin-react-hooks (orientadas a React Compiler)
// que no existían en el linter del prototipo Vite. Los patrones que marcan
// (setState síncrono en efectos, Math.random en render) ya estaban en el
// código original portado tal cual — se bajan a warning en vez de reescribir
// lógica que no fue pedida en esta migración.
nextConfig[0].rules = {
  ...nextConfig[0].rules,
  'react-hooks/set-state-in-effect': 'warn',
  'react-hooks/purity': 'warn',
}

const eslintConfig = [...nextConfig]

export default eslintConfig
