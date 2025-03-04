exports.handler = async (event) => {
    // Implementación básica de un autorizador token
    const token = event.authorizationToken;
    
    // Aquí implementarías la lógica real de validación del token
    // Por ahora, este es solo un ejemplo funcional simple
    if (token && token.toLowerCase().startsWith('bearer ')) {
      return generatePolicy('user', 'Allow', event.methodArn);
    } else {
      return generatePolicy('user', 'Deny', event.methodArn);
    }
  };
  
  // Función auxiliar para generar una política IAM
  function generatePolicy(principalId, effect, resource) {
    const authResponse = {};
    
    authResponse.principalId = principalId;
    if (effect && resource) {
      const policyDocument = {
        Version: '2012-10-17',
        Statement: [{
          Action: 'execute-api:Invoke',
          Effect: effect,
          Resource: resource
        }]
      };
      
      authResponse.policyDocument = policyDocument;
    }
    
    return authResponse;
  }