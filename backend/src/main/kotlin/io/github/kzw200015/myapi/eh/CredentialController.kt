package io.github.kzw200015.myapi.eh

import io.github.kzw200015.myapi.auth.CurrentUser
import io.github.kzw200015.myapi.eh.upstream.EhCredential
import io.github.kzw200015.myapi.web.ok
import org.springframework.web.bind.annotation.*

/** e 站凭据的绑定状态、绑定与解绑。 */
@RestController
@RequestMapping("/api/eh/credential")
class CredentialController(private val credentials: CredentialService) {
    @GetMapping
    fun status(@CurrentUser userId: Long) = ok(credentials.status(userId))

    @PostMapping
    fun bind(@CurrentUser userId: Long, @RequestBody credential: EhCredential) =
        ok(credentials.bind(userId, credential))

    @DeleteMapping
    fun unbind(@CurrentUser userId: Long) = ok(credentials.unbind(userId))
}
