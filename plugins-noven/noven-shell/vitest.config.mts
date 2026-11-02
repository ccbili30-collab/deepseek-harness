export default {
  test: {
    include: ['tests/*.spec.ts'],
    exclude: ['tests/inline-code.spec.ts'],
    environment: 'node',
  },
}
