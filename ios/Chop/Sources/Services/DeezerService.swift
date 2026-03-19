import Foundation

/// Search and download previews from Deezer's public API
actor DeezerService {
    private let session = URLSession.shared
    private let baseURL = "https://api.deezer.com"
    
    /// Search tracks by query
    func search(query: String) async throws -> [DeezerTrack] {
        guard !query.isEmpty,
              let encoded = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
              let url = URL(string: "\(baseURL)/search?q=\(encoded)&limit=25") else {
            return []
        }
        
        let (data, _) = try await session.data(from: url)
        let response = try JSONDecoder().decode(DeezerSearchResponse.self, from: data)
        return response.data
    }
    
    /// Download a 30-second preview MP3 to a temp file, returns the local URL
    func downloadPreview(track: DeezerTrack) async throws -> URL {
        guard let previewURL = track.previewURL else {
            throw DeezerError.noPreview
        }
        
        let (data, _) = try await session.data(from: previewURL)
        
        // Write to temp directory with a clean filename
        let sanitized = track.title
            .replacingOccurrences(of: "/", with: "-")
            .replacingOccurrences(of: ":", with: "-")
            .prefix(50)
        let filename = "\(sanitized) - \(track.artist.name).mp3"
        let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(filename)
        try data.write(to: tempURL)
        
        return tempURL
    }
}

enum DeezerError: LocalizedError {
    case noPreview
    
    var errorDescription: String? {
        switch self {
        case .noPreview: return "No preview available for this track"
        }
    }
}
