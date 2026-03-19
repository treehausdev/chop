import Foundation

/// Deezer search API response
struct DeezerSearchResponse: Codable {
    let data: [DeezerTrack]
}

struct DeezerTrack: Codable, Identifiable {
    let id: Int
    let title: String
    let preview: String
    let artist: DeezerArtist
    let album: DeezerAlbum
    
    var previewURL: URL? { URL(string: preview) }
}

struct DeezerArtist: Codable {
    let name: String
}

struct DeezerAlbum: Codable {
    let title: String
    let cover_small: String?
    let cover_medium: String?
    
    var coverURL: URL? {
        if let medium = cover_medium { return URL(string: medium) }
        if let small = cover_small { return URL(string: small) }
        return nil
    }
}
