const FALLBACK_MESSAGE = "Não foi possível concluir a operação.";

export function getApiErrorMessage(error) {
  const responseData = error?.response?.data;

  if (typeof responseData?.error === "string" && responseData.error.trim()) {
    return responseData.error;
  }

  if (typeof responseData?.message === "string" && responseData.message.trim()) {
    return responseData.message;
  }

  if (typeof error?.message === "string" && error.message.trim()) {
    return error.message;
  }

  return FALLBACK_MESSAGE;
}

export default getApiErrorMessage;
