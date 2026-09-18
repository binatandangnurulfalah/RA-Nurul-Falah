import { reportOperationalError, responseStatus } from './observability'
import { supabase } from './supabase'

export async function invokeObservedFunction(functionName: string, body: unknown) {
  try {
    const result = await supabase.functions.invoke(functionName, { body })
    if (result.error) {
      reportOperationalError('edge-function', result.error, {
        function_name: functionName,
        status: responseStatus(result.error),
      })
    }
    return result
  } catch (error) {
    reportOperationalError('edge-function', error, { function_name: functionName })
    throw error
  }
}

export function reportStorageFailure(operation: string, error: unknown) {
  return reportOperationalError('storage', error, {
    operation,
    status: responseStatus(error),
  })
}

export function reportDatabaseMutationFailure(operation: string, error: unknown) {
  return reportOperationalError('database-mutation', error, { operation })
}
