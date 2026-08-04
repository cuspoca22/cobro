export interface JwtPayload {
   id: string;
   /** Identificador de sesión única; debe coincidir con User.activeSessionId. */
   sid: string;
}
