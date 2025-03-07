const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

exports.handler = async (event) => {
  const authHeader = event.authorizationToken;
  
  if (!authHeader) {
    throw new Error('Unauthorized: No authorization header provided');
  }

  // Verificar formato Bearer token
  const tokenValue = event.authorizationToken.replace('Bearer ', '');
  
  try {
    // Verificar el token JWT
    const decodedToken = jwt.verify(tokenValue, JWT_SECRET);
    
    // Extraer información del usuario del token
    const userId = decodedToken.sub;
    const username = decodedToken.username;
    const userRole = decodedToken.role;
    
    // Determinar nivel de acceso basado en el rol
    const effect = 'Allow'; // Siempre permitir si el token es válido
    
    // Generar la política de autorización
    return generatePolicy(userId, effect, event.methodArn, {
      username,
      role: userRole
    });
  } catch (error) {
    console.error('Error al verificar token:', error);
    throw new Error('Unauthorized: Invalid token');
  }
};

// Genera una política de acceso IAM para API Gateway
function generatePolicy(principalId, effect, resource, context) {
  const authResponse = {
    principalId // ID del usuario autenticado
  };
  
  // Añadir política si tenemos resource y effect
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
  
  // Añadir contexto adicional que se pasa a las funciones Lambda
  if (context) {
    authResponse.context = context;
  }
  
  return authResponse;
}