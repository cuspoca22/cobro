import { Connection, ClientSession } from 'mongoose';
import { Logger } from '@nestjs/common';

/**
 * Ayudante para gestionar transacciones de MongoDB/Mongoose en NestJS.
 */
export class TransactionHelper {
  private readonly logger = new Logger(TransactionHelper.name);

  constructor(private readonly connection: Connection) { }

  /**
   * Ejecuta una operación dentro de una sesión de transacción.
   * @param operation Función que contiene las operaciones de base de datos.
   * @param context Contexto opcional para identificar el origen de la transacción.
   */
  async withTransaction<T>(
    operation: (session: ClientSession) => Promise<T>,
    context: string = 'unknown'
  ): Promise<T> {
    const transactionId = this.generateTransactionId();
    const startTime = Date.now();

    const session = await this.connection.startSession();

    try {
      session.startTransaction();

      const result = await operation(session);
      await session.commitTransaction();

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;

      this.logger.error(
        `Error en transacción ${transactionId} [${context}] después de ${duration}ms: ${error.message}`,
        error.stack
      );

      if (session.inTransaction()) {
        await session.abortTransaction();
      }

      throw error;

    } finally {
      try {
        await session.endSession();
      } catch (endError) {
        this.logger.warn(`Error ending session for transaction ${transactionId}: ${endError.message}`);
      }
    }
  }

  /**
   * Genera un identificador único para la transacción.
   */
  private generateTransactionId(): string {
    return `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}