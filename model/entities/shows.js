
export const getAllShows = async (client) => {
    try {
        const result = await client.query("SELECT * FROM shows");
        return result.rows;
    } catch (error) {
        console.error("Error en la consulta de shows: ", error);
        throw error;
    }
};